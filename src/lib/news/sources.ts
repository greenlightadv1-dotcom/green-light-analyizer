/**
 * Official news sources (docs/G_CONTENT_INTELLIGENCE_ARCHITECTURE.md).
 *
 * An allow-list, not a crawler. Each source is an official, free, documented
 * feed, verified to respond on 2026-11-03:
 *   - YouTube Official Blog RSS (blog.youtube/rss/): platform and creator updates.
 *   - Steam Web API ISteamNews/GetNewsForApp (Valve, no key): per-game news.
 *     Only the developer's own announcements are kept
 *     (feedname "steam_community_announcements"); third-party press items
 *     the API mixes in are dropped.
 *
 * Only a headline, its link, the publication time, the retrieval time and
 * the source are stored. No article text is stored or shown, and nothing is
 * generated: G may cite a stored headline with its link and date, nothing
 * more. Adding a source is a code change that needs the owner's approval of
 * the source's terms. Games' tags are taxonomy ids (0033).
 *
 * Pure — tested in news.test.ts.
 */

export type NewsSource =
  | { id: string; kind: "rss"; name: string; url: string; hosts: string[]; tags: string[] }
  | { id: string; kind: "steam"; name: string; appId: number; hosts: string[]; tags: string[] };

const STEAM_HOSTS = ["store.steampowered.com", "steamstore-a.akamaihd.net", "steamcommunity.com"];

export const NEWS_SOURCES: NewsSource[] = [
  { id: "youtube_blog", kind: "rss", name: "YouTube Official Blog", url: "https://blog.youtube/rss/", hosts: ["blog.youtube"], tags: ["platform_youtube"] },
  { id: "steam_cs2", kind: "steam", name: "Counter-Strike 2 (Valve, Steam)", appId: 730, hosts: STEAM_HOSTS, tags: ["counter_strike", "gaming", "esports"] },
  { id: "steam_dota2", kind: "steam", name: "Dota 2 (Valve, Steam)", appId: 570, hosts: STEAM_HOSTS, tags: ["dota2", "gaming", "esports"] },
  { id: "steam_pubg", kind: "steam", name: "PUBG: Battlegrounds (Steam)", appId: 578080, hosts: STEAM_HOSTS, tags: ["pubg", "gaming"] },
  { id: "steam_apex", kind: "steam", name: "Apex Legends (Steam)", appId: 1172470, hosts: STEAM_HOSTS, tags: ["apex_legends", "gaming"] },
  { id: "steam_rocket_league", kind: "steam", name: "Rocket League (Steam)", appId: 252950, hosts: STEAM_HOSTS, tags: ["rocket_league", "gaming", "esports"] },
];

export type NewsItem = { source_id: string; external_id: string; title: string; url: string; published_at: string; tags: string[] };

export const NEWS_LIMITS = { titleMax: 300, perSource: 10, retentionDays: 60 } as const;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };
function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 31 ? String.fromCodePoint(n) : "";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A link is kept only if it is https and on one of the source's own hosts. */
export function allowedUrl(raw: string, hosts: string[]): string | null {
  try {
    const u = new URL(raw.trim().replace(/ /g, "%20"));
    if (u.protocol !== "https:" || !hosts.includes(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function item(source: NewsSource, external: string, title: string, url: string, published: Date): NewsItem | null {
  const t = decode(title).slice(0, NEWS_LIMITS.titleMax);
  const link = allowedUrl(url, source.hosts);
  if (!t || !link || !external || Number.isNaN(published.getTime())) return null;
  return { source_id: source.id, external_id: external.slice(0, 200), title: t, url: link, published_at: published.toISOString(), tags: source.tags };
}

/** RSS 2.0 items: title, link, guid, pubDate. Linear scan; bounded input. */
export function parseRss(source: NewsSource, xml: string): NewsItem[] {
  const out: NewsItem[] = [];
  const body = xml.slice(0, 2_000_000);
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  const tag = (block: string, name: string) => new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(block)?.[1] ?? "";
  while ((m = re.exec(body)) && out.length < NEWS_LIMITS.perSource) {
    const block = m[1];
    const link = decode(tag(block, "link"));
    const guid = decode(tag(block, "guid")) || link;
    const it = item(source, guid, tag(block, "title"), link, new Date(decode(tag(block, "pubDate"))));
    if (it) out.push(it);
  }
  return out;
}

type SteamResponse = { appnews?: { newsitems?: { gid?: string; title?: string; url?: string; date?: number; feedname?: string }[] } };

/** Steam GetNewsForApp: the developer's own announcements only. */
export function parseSteam(source: NewsSource, json: unknown): NewsItem[] {
  const items = (json as SteamResponse)?.appnews?.newsitems ?? [];
  const out: NewsItem[] = [];
  for (const n of items) {
    if (n.feedname !== "steam_community_announcements") continue;
    if (typeof n.date !== "number") continue;
    const it = item(source, String(n.gid ?? ""), String(n.title ?? ""), String(n.url ?? ""), new Date(n.date * 1000));
    if (it) out.push(it);
    if (out.length >= NEWS_LIMITS.perSource) break;
  }
  return out;
}

export function sourceUrl(source: NewsSource): string {
  return source.kind === "rss"
    ? source.url
    : `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${source.appId}&count=${NEWS_LIMITS.perSource * 3}&maxlength=1&format=json`;
}

/** Headlines relevant to a creator: any tag in common with their categories, games or platforms. */
export function relevantNews<T extends { tags: string[] }>(items: T[], interests: string[]): T[] {
  const set = new Set(interests);
  return items.filter((i) => i.tags.some((t) => set.has(t)));
}

export function newsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NEWS_MONITORING_ENABLED === "1";
}

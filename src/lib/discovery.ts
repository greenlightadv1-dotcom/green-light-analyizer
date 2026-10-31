import type { Platform } from "./types/database.ts";
import { PLATFORMS } from "./media-kit/platforms.ts";
import { CONTENT_CATEGORIES, GAME_IDS, knownCategories, knownGames, type ContentCategory, type GameId } from "./taxonomy.ts";
import { isFresh, toShares } from "./g/provenance.ts";
import type { DirectoryRow } from "./g/recommend.ts";

/**
 * Creator Discovery — search, filters, sorting and pagination (feature 8).
 *
 * Runs on the server over the rows creator_directory() returned to this
 * caller (company or admin only, no PII), so the browser receives one page of
 * already-authorized data. G's recommendations read the very same rows.
 *
 * Every sort is explainable in one sentence and uses values as stored; there
 * is no hidden score:
 *   reach      — reported average views, highest first
 *   engagement — reported engagement rate, highest first
 *   verified   — fresh verified audience geography first, then reach
 *   name       — alphabetical
 *
 * Pure — unit-tested in discovery.test.ts.
 */

export const DISCOVERY_SORTS = ["reach", "engagement", "verified", "name"] as const;
export type DiscoverySort = (typeof DISCOVERY_SORTS)[number];
export const PAGE_SIZE = 12;

export type DiscoveryQuery = {
  q: string;
  category: ContentCategory | null;
  game: GameId | null;
  platform: Platform | null;
  country: string | null;
  minViews: number | null;
  verifiedOnly: boolean;
  sort: DiscoverySort;
  page: number;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseDiscoveryQuery(params: Record<string, string | string[] | undefined>): DiscoveryQuery {
  const q = (first(params.q) ?? "").trim().slice(0, 80);
  const category = first(params.category);
  const game = first(params.game);
  const platform = first(params.platform);
  const country = (first(params.country) ?? "").trim().toUpperCase();
  const minViews = Number(first(params.minViews));
  const sort = first(params.sort);
  const page = Math.floor(Number(first(params.page)));
  return {
    q,
    category: (CONTENT_CATEGORIES as readonly string[]).includes(category ?? "") ? (category as ContentCategory) : null,
    game: (GAME_IDS as readonly string[]).includes(game ?? "") ? (game as GameId) : null,
    platform: (PLATFORMS as readonly string[]).includes(platform ?? "") ? (platform as Platform) : null,
    country: /^[A-Z]{2}$/.test(country) ? country : null,
    minViews: Number.isFinite(minViews) && minViews > 0 ? Math.min(minViews, 1e9) : null,
    verifiedOnly: first(params.verified) === "1",
    sort: (DISCOVERY_SORTS as readonly string[]).includes(sort ?? "") ? (sort as DiscoverySort) : "reach",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 1000) : 1,
  };
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** Whether this row's verified geography is usable (verified and fresh). */
export function hasFreshVerifiedGeo(row: DirectoryRow, now: Date): boolean {
  if (!row.audience_verified || !toShares(row.verified_top_countries).length) return false;
  // A pre-0024 directory has no timestamp; 0010 already gated on audience_verified.
  return row.verified_geo_synced_at === undefined ? true : isFresh(row.verified_geo_synced_at, now);
}

function categoriesOf(row: DirectoryRow): ContentCategory[] {
  const own = knownCategories(row.creator_categories);
  const kit = row.content_category?.trim().toLowerCase();
  if (kit && (CONTENT_CATEGORIES as readonly string[]).includes(kit) && !own.includes(kit as ContentCategory)) {
    own.push(kit as ContentCategory);
  }
  return own;
}

export function filterDirectory(
  rows: readonly DirectoryRow[],
  query: DiscoveryQuery,
  now: Date = new Date(),
): { items: DirectoryRow[]; total: number; page: number; pages: number } {
  const needle = query.q.toLowerCase();
  const filtered = rows.filter((r) => {
    if (needle && !r.full_name.toLowerCase().includes(needle)) return false;
    if (query.category && !categoriesOf(r).includes(query.category)) return false;
    if (query.game && !knownGames(r.creator_games).includes(query.game)) return false;
    if (query.platform && !(r.platforms ?? []).includes(query.platform)) return false;
    if (query.minViews !== null && (num(r.avg_views) ?? -1) < query.minViews) return false;
    const fresh = hasFreshVerifiedGeo(r, now);
    if (query.verifiedOnly && !fresh) return false;
    if (query.country) {
      const shares = fresh ? toShares(r.verified_top_countries) : toShares(r.declared_top_countries);
      if (!shares.some((s) => s.country === query.country && s.pct > 0)) return false;
    }
    return true;
  });

  const views = (r: DirectoryRow) => num(r.avg_views) ?? -1;
  const engagement = (r: DirectoryRow) => num(r.engagement_rate) ?? -1;
  const sorted = filtered
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      switch (query.sort) {
        case "engagement":
          return engagement(b.r) - engagement(a.r) || a.i - b.i;
        case "verified":
          return Number(hasFreshVerifiedGeo(b.r, now)) - Number(hasFreshVerifiedGeo(a.r, now)) || views(b.r) - views(a.r) || a.i - b.i;
        case "name":
          return a.r.full_name.localeCompare(b.r.full_name) || a.i - b.i;
        default:
          return views(b.r) - views(a.r) || a.i - b.i;
      }
    })
    .map((x) => x.r);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(query.page, pages);
  return { items: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: sorted.length, page, pages };
}

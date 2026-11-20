import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { NEWS_LIMITS, NEWS_SOURCES, parseRss, parseSteam, sourceUrl, type NewsItem } from "./sources";

/**
 * Fetch every allow-listed official feed once and store its headlines
 * (0037). Polite: one request per source, a 10-second timeout, an
 * identifying User-Agent, sequential. A failing source is logged and
 * skipped; nothing is invented to fill it. Sends no notification.
 */
export async function refreshNews(): Promise<{ source: string; stored: number; error: string | null }[]> {
  const service = createAdminClient();
  const results: { source: string; stored: number; error: string | null }[] = [];
  for (const source of NEWS_SOURCES) {
    let items: NewsItem[] = [];
    try {
      const res = await fetch(sourceUrl(source), {
        signal: AbortSignal.timeout(10_000),
        headers: { "user-agent": "GreenLightNews/1.0 (+https://www.greenlightadvs.com)", accept: source.kind === "rss" ? "application/rss+xml, application/xml" : "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      items = source.kind === "rss" ? parseRss(source, (await res.text()).slice(0, 2_000_000)) : parseSteam(source, await res.json());
    } catch (e) {
      const error = e instanceof Error ? e.message.slice(0, 120) : "fetch failed";
      log.warn("news.source_failed", { source: source.id, error });
      results.push({ source: source.id, stored: 0, error });
      continue;
    }
    if (items.length) {
      const { error } = await service.from("news_items").upsert(items.map((i) => ({ ...i, retrieved_at: new Date().toISOString() })), { onConflict: "source_id,external_id" });
      if (error) {
        log.error("news.store_failed", { source: source.id, code: error.code });
        results.push({ source: source.id, stored: 0, error: "store failed" });
        continue;
      }
    }
    results.push({ source: source.id, stored: items.length, error: null });
  }
  const cutoff = new Date(Date.now() - NEWS_LIMITS.retentionDays * 86_400_000).toISOString();
  await service.from("news_items").delete().lt("published_at", cutoff);
  return results;
}

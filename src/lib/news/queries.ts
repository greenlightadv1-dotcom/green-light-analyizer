import "server-only";

import { createClient } from "@/lib/supabase/server";
import { NEWS_SOURCES, relevantNews } from "./sources";
import type { NewsHeadline } from "@/components/content/OfficialNewsPanel";

/** Recent stored headlines matching these taxonomy tags (RLS: signed-in read). Empty before 0037. */
export async function newsFor(tags: string[], limit = 8): Promise<NewsHeadline[]> {
  if (!tags.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("news_items").select("source_id, title, url, published_at, tags").overlaps("tags", tags).order("published_at", { ascending: false }).limit(limit * 2);
  if (error || !data) return [];
  return relevantNews(data, tags).slice(0, limit).map((n) => ({
    title: n.title,
    url: n.url,
    published_at: n.published_at,
    source: NEWS_SOURCES.find((s) => s.id === n.source_id)?.name ?? n.source_id,
  }));
}

/** A creator's tags for news: their categories and games, plus YouTube platform news when they have a YouTube kit. */
export function newsTagsFor(profile: { creator_categories?: string[] | null; creator_games?: string[] | null }, platforms: string[]): string[] {
  return [...(profile.creator_categories ?? []), ...(profile.creator_games ?? []), ...(platforms.includes("youtube") ? ["platform_youtube"] : [])];
}

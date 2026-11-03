import "server-only";

import { createClient } from "@/lib/supabase/server";
import { staleCleanupCutoff } from "@/lib/oauth/youtube-freshness";
export type { MediaKit } from "./helpers";
export { kitByPlatform } from "./helpers";
import type { MediaKit } from "./helpers";
import { isRealOAuthPlatform } from "@/lib/oauth/platforms";
import type { MediaKitSnapshot, OAuthPlatform } from "@/lib/types/database";
import { cutoffDay } from "./growth";

/**
 * Reads for the Media Kit page. Uses the caller's client, so RLS decides what
 * comes back — a creator sees only their own kits without this filtering.
 */
export async function listMediaKits(creatorId: string): Promise<MediaKit[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("media_kits")
    .select("*")
    .eq("creator_id", creatorId)
    .order("avg_views", { ascending: false });
  return data ?? [];
}

/**
 * Which analytics connections (§7.3) a creator currently has live, for the
 * Settings summary card.
 *
 * Deliberately not listMediaKits(): that selects every column, including the
 * two audience-geography JSONB blobs, to answer what is really two booleans.
 * Platforms without a connector are skipped rather than reported false — the
 * card only offers connections the backend can actually complete.
 */
export async function listAnalyticsConnections(
  creatorId: string,
): Promise<Partial<Record<OAuthPlatform, boolean>>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("media_kits")
    .select("platform, analytics_oauth_connected")
    .eq("creator_id", creatorId);

  const connections: Partial<Record<OAuthPlatform, boolean>> = {};
  for (const row of data ?? []) {
    if (isRealOAuthPlatform(row.platform)) {
      connections[row.platform] = row.analytics_oauth_connected === true;
    }
  }
  return connections;
}

/**
 * The caller's own growth snapshots (0025), newest first, within the 29-day
 * window. Read with the caller's client: RLS limits it to the creator's own
 * rows (or every row for an admin). Returns [] on any error, so the Media Kit
 * shows "no growth yet" rather than failing.
 */
export async function listSnapshots(creatorId: string): Promise<MediaKitSnapshot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media_kit_snapshots")
    .select("*")
    .eq("creator_id", creatorId)
    .gte("captured_on", cutoffDay(new Date()))
    .order("captured_on", { ascending: false })
    .limit(200);
  if (error) return [];
  return data ?? [];
}

export type KitVideo = { media_kit_id: string; video_id: string; title: string | null; published_at: string | null; view_count: number | null; like_count: number | null; comment_count: number | null; synced_at: string };

/** The creator's own recent uploads (0035, RLS), within the 29-day retention. Empty before 0035. */
export async function listKitVideos(creatorId: string): Promise<KitVideo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media_kit_videos")
    .select("media_kit_id, video_id, title, published_at, view_count, like_count, comment_count, synced_at")
    .eq("creator_id", creatorId)
    .gte("synced_at", staleCleanupCutoff(new Date()))
    .order("published_at", { ascending: false })
    .limit(200);
  if (error) return [];
  return data ?? [];
}

import "server-only";

import { createClient } from "@/lib/supabase/server";
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

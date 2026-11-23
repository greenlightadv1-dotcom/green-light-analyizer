import "server-only";

import { log } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { cutoffDay } from "@/lib/media-kit/growth";
import type { AccountStats, ConnectPlatform } from "./providers";

/**
 * Writes a connected account's counts into its media kit (service role: the
 * synced columns are withheld from `authenticated`, 0014/0042).
 *
 * subscriber_count, media_count and recent_median_views only ever come from
 * here for these platforms, and stats_synced_at says when. The creator's own
 * typed fields (avg_views, category, declared countries) are left alone: the
 * synced numbers sit beside them, labelled, rather than overwriting them.
 */

const SNAPSHOT_SOURCE: Record<ConnectPlatform, "twitch_helix_api" | "kick_public_api" | "tiktok_display_api"> = {
  twitch: "twitch_helix_api",
  kick: "kick_public_api",
  tiktok: "tiktok_display_api",
};

/**
 * Another Green Light account already connected to the same platform account.
 * One Twitch channel must not back two creators' media kits.
 */
export async function connectedElsewhere(
  platform: ConnectPlatform,
  externalId: string,
  creatorId: string,
): Promise<boolean> {
  const service = createAdminClient();
  const { data, error } = await service
    .from("oauth_connections")
    .select("creator_id")
    .eq("platform", platform)
    .eq("external_account_id", externalId)
    .neq("creator_id", creatorId)
    .limit(1);
  if (error) {
    // Fail closed: an unanswerable duplicate check refuses the connection.
    log.error("connect.duplicate_check_failed", { platform, error });
    return true;
  }
  return (data ?? []).length > 0;
}

export async function writeAccountStats(
  creatorId: string,
  platform: ConnectPlatform,
  stats: AccountStats,
): Promise<boolean> {
  const service = createAdminClient();
  const now = new Date().toISOString();

  const { data: kit, error } = await service
    .from("media_kits")
    .upsert(
      {
        creator_id: creatorId,
        platform,
        platform_handle: stats.handle,
        subscriber_count: stats.followers,
        media_count: stats.mediaCount,
        recent_median_views: stats.recentViews?.median ?? null,
        recent_views_sample: stats.recentViews?.sample ?? null,
        stats_synced_at: now,
        last_synced_at: now,
      },
      { onConflict: "creator_id,platform" },
    )
    .select("id")
    .single();

  if (error || !kit) {
    log.error("connect.kit_write_failed", { platform, error });
    return false;
  }

  // Growth history (0025): one snapshot per kit per UTC day, only when there
  // is a count to record. A failure here never fails the connection.
  if (stats.followers !== null || stats.mediaCount !== null) {
    const { error: snapshotError } = await service.from("media_kit_snapshots").upsert(
      {
        media_kit_id: kit.id,
        creator_id: creatorId,
        platform,
        source: SNAPSHOT_SOURCE[platform],
        captured_on: now.slice(0, 10),
        captured_at: now,
        subscriber_count: stats.followers,
        channel_view_count: null,
        media_count: stats.mediaCount,
      },
      { onConflict: "media_kit_id,captured_on" },
    );
    if (snapshotError) log.error("media_kit_snapshot.write_failed", { media_kit_id: kit.id, error: snapshotError });
    await service.from("media_kit_snapshots").delete().eq("media_kit_id", kit.id).lt("captured_on", cutoffDay(new Date()));
  }
  return true;
}

/** Disconnecting removes the synced counts too: they were only true while connected. */
export async function clearAccountStats(creatorId: string, platform: ConnectPlatform): Promise<void> {
  const service = createAdminClient();
  const { error } = await service
    .from("media_kits")
    .update({
      subscriber_count: null,
      media_count: null,
      recent_median_views: null,
      recent_views_sample: null,
      stats_synced_at: null,
    })
    .eq("creator_id", creatorId)
    .eq("platform", platform);
  if (error) log.error("connect.kit_clear_failed", { platform, error });
}

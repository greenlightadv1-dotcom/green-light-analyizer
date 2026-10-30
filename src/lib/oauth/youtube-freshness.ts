/**
 * YouTube API data freshness and revocation — CLAUDE.md §7.3, §12 (G1).
 *
 * YouTube API Services Developer Policies (checked 2026-10-30, page dated
 * 2026-10-15): when a user revokes consent, "you and your API Clients must
 * also delete all API Data related to that user"; clients "will need to
 * periodically reconfirm that its authorization tokens are still valid and
 * delete API Data associated with users whose authorization tokens cannot be
 * refreshed", within 30 calendar days; and stored API data must be refreshed
 * or deleted rather than kept indefinitely.
 *
 * So:
 * - A refresh Google answers with `invalid_grant` (revoked, expired, or the
 *   password changed) clears that creator's YouTube verified geography and
 *   deletes the stored token — immediately, on whichever path saw it.
 * - Verified geography is used and shown only while it is younger than
 *   VERIFIED_GEO_MAX_AGE_MS, measured from `verified_geo_synced_at` (migration
 *   0023), never from `last_synced_at`, which the public-stats sync also
 *   writes.
 * - A daily cron (api/cron/youtube-data-freshness) deletes it once older
 *   than STALE_CLEANUP_AFTER_MS — a day under the limit, so a daily run keeps
 *   storage inside 30 days — and re-checks every stored token.
 *
 * Only the verified-geography columns and the YouTube token row are ever
 * cleared; nothing the creator entered is touched.
 *
 * Pure (no Node or server imports), so client views can use it and it is
 * unit-tested directly.
 */

const DAY_MS = 86_400_000;
export const VERIFIED_GEO_MAX_AGE_MS = 30 * DAY_MS;
export const STALE_CLEANUP_AFTER_MS = 29 * DAY_MS;

/** True only for a verified kit whose geography was synced within 30 days. */
export function isVerifiedGeoFresh(
  kit: { audience_verified?: boolean | null; verified_geo_synced_at?: string | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (kit?.audience_verified !== true) return false;
  const syncedAt = kit.verified_geo_synced_at ? Date.parse(kit.verified_geo_synced_at) : Number.NaN;
  if (!Number.isFinite(syncedAt)) return false;
  const age = now.getTime() - syncedAt;
  // A timestamp more than a minute in the future is not trusted either.
  return age >= -60_000 && age < VERIFIED_GEO_MAX_AGE_MS;
}

/** The ISO cutoff before which the cron deletes verified geography. */
export function staleCleanupCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - STALE_CLEANUP_AFTER_MS).toISOString();
}

/** What a revoked or stale connection's media kit row is set to. */
export function clearedVerifiedGeo(options: { disconnect: boolean }) {
  return {
    audience_verified: false,
    verified_top_countries: null,
    verified_geo_synced_at: null,
    ...(options.disconnect ? { analytics_oauth_connected: false } : {}),
  };
}

/**
 * Whether a failed token refresh means the grant is gone for good. Only
 * Google's documented `invalid_grant` counts: a 5xx, a timeout or a
 * misconfigured client must never delete a creator's connection.
 */
export function isRevokedGrant(status: number, body: unknown): boolean {
  if (status !== 400 && status !== 401) return false;
  return (
    !!body &&
    typeof body === "object" &&
    (body as Record<string, unknown>).error === "invalid_grant"
  );
}

/**
 * What a YouTube kit whose public stats are older than the limit is set to.
 * Only the three columns the API-key sync alone writes (0023's comment);
 * engagement_rate, avg_views and everything else a creator may have typed
 * stay as they are.
 */
export function clearedYouTubeStats() {
  return {
    subscriber_count: null,
    channel_view_count: null,
    media_count: null,
    youtube_stats_synced_at: null,
  };
}

/** True when a kit's synced public stats are younger than 30 days. */
export function isYouTubeStatsFresh(
  kit: { youtube_stats_synced_at?: string | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  const syncedAt = kit?.youtube_stats_synced_at ? Date.parse(kit.youtube_stats_synced_at) : Number.NaN;
  if (!Number.isFinite(syncedAt)) return false;
  const age = now.getTime() - syncedAt;
  return age >= -60_000 && age < VERIFIED_GEO_MAX_AGE_MS;
}

-- 0023 — media_kits.verified_geo_synced_at (G1).
--
-- YouTube API Services Developer Policies require stored API data to be
-- refreshed or deleted, and data for users whose tokens cannot be refreshed
-- to be deleted within 30 days. Freshness of verified audience geography has
-- to be measured from when *it* was synced. last_synced_at cannot be used:
-- the public-stats sync, the OAuth callback and disconnect all write it too.
--
-- Additive and nullable. Existing verified rows get NULL, which the app
-- treats as stale (src/lib/oauth/youtube-freshness.ts): they read as
-- unverified until the creator syncs again, and the daily cleanup clears
-- them. Written only by the service role; authenticated keeps no
-- INSERT/UPDATE on media_kits (0003), so a creator cannot extend their
-- own freshness. SELECT is table-level, so the existing media_kits_select
-- policy covers the new column.

ALTER TABLE public.media_kits
  ADD COLUMN IF NOT EXISTS verified_geo_synced_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.media_kits.verified_geo_synced_at IS
  'When verified_top_countries was last fetched from an official Analytics API. NULL = never or cleared. Service role only. Older than 30 days = not verified (YouTube API Services data policy).';

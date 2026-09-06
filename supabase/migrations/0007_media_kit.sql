-- ---------------------------------------------------------------------------
-- Green Light — Media Kit support (§7)
--
-- Two gaps in the §10 media_kits table that the page exposes immediately:
--
--   1. Nothing stops a creator holding two YouTube rows. §7 treats a media kit
--      as one record per creator per platform, buildEvaluationInput() picks a
--      single row to price from, and the page renders one card per platform —
--      all three assume uniqueness that the schema never enforced.
--
--   2. There is no handle or channel identifier. §9 lists the YouTube Data API
--      and Twitch Helix for basic stats, and neither can be called without one;
--      a media kit shown to a sponsor with no channel name on it is also not
--      much of a media kit.
-- ---------------------------------------------------------------------------

-- One kit per creator per platform.
CREATE UNIQUE INDEX IF NOT EXISTS media_kits_creator_platform_key
  ON public.media_kits (creator_id, platform);

ALTER TABLE public.media_kits
  ADD COLUMN IF NOT EXISTS platform_handle TEXT;

COMMENT ON COLUMN public.media_kits.platform_handle IS
  'Channel/handle on the platform, e.g. a YouTube handle or Twitch login. Needed to call the §9 basic-stats APIs, and shown on the kit.';

-- Creator-writable, like the other self-reported fields. Deliberately NOT
-- extending the grant to verified_top_countries, audience_verified or
-- analytics_oauth_connected: those stay service_role-only so the verified
-- badge can never be self-asserted (§7.2).
GRANT INSERT (platform_handle) ON public.media_kits TO authenticated;
GRANT UPDATE (platform_handle) ON public.media_kits TO authenticated;

-- Backs the per-creator card list and the "which platforms are connected" count
-- that the §8 tier limit is checked against.
CREATE INDEX IF NOT EXISTS media_kits_creator_platform_idx
  ON public.media_kits (creator_id, platform);

-- ===========================================================================
-- 0031 — Synced recent-upload views (docs/AI_ANALYZER_ROOT_CAUSE_REPORT.md A2)
-- ===========================================================================
-- The YouTube sync already fetched the view count of the last 10 uploads, to
-- compute engagement, and then discarded it. avg_views, the reach figure
-- pricing and the assessment use, stayed creator-typed only. These columns
-- keep the median of those views and the sample size, as synced public data.
--
-- * Written by the server only. authenticated holds column-level grants on
--   media_kits (0003/0007), and none is added here.
-- * The data is YouTube public data, so it follows 0023's retention: it is
--   cleared together with subscriber_count when youtube_stats_synced_at is
--   29 days old (lib/oauth/youtube-freshness.ts clearedYouTubeStats).
-- * Pricing does not read it yet: switching pricing from the typed figure to
--   this one is an owner decision (PENDING_OWNER_DECISIONS item 12).
--
-- IDEMPOTENT. ROLLBACK: alter table public.media_kits drop column if exists
-- recent_median_views, drop column if exists recent_views_sample;
-- ===========================================================================
alter table public.media_kits add column if not exists recent_median_views integer check (recent_median_views is null or recent_median_views >= 0);
alter table public.media_kits add column if not exists recent_views_sample smallint check (recent_views_sample is null or recent_views_sample between 0 and 50);
comment on column public.media_kits.recent_median_views is
  'Median views of the most recent uploads, from the YouTube Data API (0031). Service role only. Cleared with the other synced stats at 29 days.';
comment on column public.media_kits.recent_views_sample is
  'How many recent uploads recent_median_views is the median of (0031).';

-- ---------------------------------------------------------------------------
-- Green Light — engagement-rate sync target + AI niche detection
--
-- No new "verified" columns for engagement_rate or content_category: unlike
-- subscriber_count/channel_view_count (0014), which have no self-reported
-- equivalent, engagement_rate and content_category are the exact same
-- concept whether a creator typed them or a sync computed them, so a sync
-- overwrites the existing column directly rather than duplicating it next to
-- an unused parallel field. content_tags has no self-reported equivalent at
-- all -- creators have never had a tags field -- so it's purely additive.
-- ---------------------------------------------------------------------------

ALTER TABLE public.media_kits
  ADD COLUMN media_count INTEGER,
  ADD COLUMN content_tags TEXT[];

COMMENT ON COLUMN public.media_kits.media_count IS
  'Video count (YouTube) or post count (Instagram), from the same sync as subscriber_count/channel_view_count. NULL until synced.';
COMMENT ON COLUMN public.media_kits.content_tags IS
  'AI-generated content tags from recent video/post titles and descriptions (NVIDIA-hosted Kimi K3, same engine as evaluateOffer()). Supplementary to content_category, which a niche-detection run overwrites directly rather than duplicating.';

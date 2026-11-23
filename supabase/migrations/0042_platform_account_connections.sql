-- ---------------------------------------------------------------------------
-- 0042 — Platform account connections: Twitch, Kick, TikTok (owner decision,
-- 2026-11-23).
--
-- A creator can now sign in to Twitch, Kick or TikTok through that platform's
-- own OAuth. The connection proves the creator owns the account, and the
-- account's public counts (followers, videos, recent views) are then read from
-- the official API instead of typed by hand. None of these platforms exposes
-- audience geography, so verified_top_countries stays YouTube/Instagram only.
--
-- Changes:
--   1. oauth_connections, media_kits and media_kit_snapshots accept the new
--      platforms (TikTok becomes a storable media kit).
--   2. media_kits.stats_synced_at: when the counts on this kit last came from
--      the platform's API. Server-written only, like subscriber_count.
--   3. media_kit_snapshots.source accepts the new APIs.
--
-- Idempotent: every constraint is dropped by name before it is re-added, and
-- the column is added IF NOT EXISTS.
-- ---------------------------------------------------------------------------

alter table public.oauth_connections
  drop constraint if exists oauth_connections_platform_check;
alter table public.oauth_connections
  add constraint oauth_connections_platform_check
  check (platform in ('youtube', 'instagram', 'twitch', 'kick', 'tiktok'));

alter table public.media_kits
  drop constraint if exists media_kits_platform_check;
alter table public.media_kits
  add constraint media_kits_platform_check
  check (platform in ('youtube', 'twitch', 'kick', 'instagram', 'tiktok'));

alter table public.media_kit_snapshots
  drop constraint if exists media_kit_snapshots_platform_check;
alter table public.media_kit_snapshots
  add constraint media_kit_snapshots_platform_check
  check (platform in ('youtube', 'twitch', 'kick', 'instagram', 'tiktok'));

alter table public.media_kit_snapshots
  drop constraint if exists media_kit_snapshots_source_check;
alter table public.media_kit_snapshots
  add constraint media_kit_snapshots_source_check
  check (source in ('youtube_data_api', 'instagram_graph_api', 'twitch_helix_api', 'kick_public_api', 'tiktok_display_api'));

alter table public.media_kits
  add column if not exists stats_synced_at timestamp with time zone;

comment on column public.media_kits.stats_synced_at is
  'When subscriber_count / media_count / recent_median_views on this kit last came from the platform''s own API through a connected account (Twitch, Kick, TikTok). Null means the counts were never synced. Server-written only.';

-- Server-written only: never writable by the browser's identity.
revoke insert (stats_synced_at), update (stats_synced_at) on public.media_kits from authenticated;

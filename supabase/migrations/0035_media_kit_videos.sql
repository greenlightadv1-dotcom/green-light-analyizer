-- ===========================================================================
-- 0035: Recent uploads per YouTube media kit (top content, posting cadence)
-- ===========================================================================
--
-- Spec: docs/SOCIAL_INTEGRATIONS_AND_SYNC_AUDIT.md (creator analytics)
--
-- WHAT
--   media_kit_videos: the most recent uploads (up to 50) the YouTube Data API
--   returned on the last successful sync: video id, title, publication time,
--   and the public view / like / comment counts. like_count and
--   comment_count are NULL when the channel hides them: unavailable is never
--   stored as zero.
--
-- WHY THE 29-DAY RULE
--   These are YouTube API "Non-Authorized Data" (Developer Policies III.E.4):
--   not stored for more than 30 days. Each sync replaces the kit's rows; the
--   daily freshness job deletes anything older than 29 days.
--
-- WHO
--   * The creator and admins read (RLS). Nobody else, including companies.
--   * Only the server writes (service role, after the sync).
--
-- PREREQUISITES 0001 (media_kits), 0004 (private.is_admin). IDEMPOTENT.
--
-- ROLLBACK: drop table if exists public.media_kit_videos;
--           alter table public.media_kits drop column if exists recent_videos_complete;
-- ===========================================================================

create table if not exists public.media_kit_videos (
  id bigint generated always as identity primary key,
  media_kit_id uuid not null references public.media_kits (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null default 'youtube' check (platform = 'youtube'),
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{6,20}$'),
  title text check (title is null or char_length(title) <= 200),
  published_at timestamptz,
  view_count bigint check (view_count is null or view_count >= 0),
  like_count bigint check (like_count is null or like_count >= 0),
  comment_count bigint check (comment_count is null or comment_count >= 0),
  synced_at timestamptz not null default now(),
  unique (media_kit_id, video_id)
);
create index if not exists media_kit_videos_kit_idx on public.media_kit_videos (media_kit_id, published_at desc);
create index if not exists media_kit_videos_synced_idx on public.media_kit_videos (synced_at);

-- Whether the last sync returned the channel's whole upload list (fewer than
-- 50 uploads), so cadence over long windows is known. Server-written only.
alter table public.media_kits add column if not exists recent_videos_complete boolean;
revoke update (recent_videos_complete) on public.media_kits from authenticated;

alter table public.media_kit_videos enable row level security;
revoke all on public.media_kit_videos from anon, authenticated;
grant select on public.media_kit_videos to authenticated;
revoke all on public.media_kit_videos from service_role;
grant select, insert, delete on public.media_kit_videos to service_role;
grant usage, select on sequence public.media_kit_videos_id_seq to service_role;

drop policy if exists media_kit_videos_select on public.media_kit_videos;
create policy media_kit_videos_select on public.media_kit_videos for select to authenticated
  using (creator_id = (select auth.uid()) or private.is_admin());

comment on table public.media_kit_videos is
  'Recent YouTube uploads per kit (0035). Public API statistics; replaced on each sync, deleted after 29 days. Hidden counts are NULL, never 0.';

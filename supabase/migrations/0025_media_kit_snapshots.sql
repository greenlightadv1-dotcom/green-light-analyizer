-- ===========================================================================
-- 0025 — media_kit_snapshots: real history for creator growth
--
-- PURPOSE
--   Growth must come from real, dated measurements — never from a single
--   current number. Each successful platform-stats sync records one snapshot
--   per media kit per UTC day. Growth is then the difference between two real
--   snapshots on different days, or it is not shown at all.
--
-- DATA POLICY (YouTube API Services Developer Policies, III.E.4)
--   The YouTube stats sync reads public statistics with an API key, which the
--   policy calls Non-Authorized Data: such statistics "must not be stored for
--   more than 30 days". So every snapshot is deleted once it is older than 29
--   days — by the server on each new sync of that kit, and by the daily
--   /api/cron/youtube-data-freshness job (which needs CRON_SECRET in
--   Production). History longer than 29 days is a separate owner decision
--   (see docs/RELEASE/PENDING_OWNER_DECISIONS.md).
--
-- ACCESS
--   * Written only by the server (service role). No INSERT/UPDATE/DELETE for
--     anon or authenticated, so a client can never fabricate a measurement.
--   * A creator reads only their own snapshots; an admin reads all. Companies
--     read none (their directory RPC is unchanged).
--
-- PREREQUISITES
--   0007 (media_kits), 0004 (private.is_admin()). Additive only: one new
--   table, its indexes, RLS policies and grants. No existing object changes.
--
-- IDEMPOTENT
--   Every statement uses IF NOT EXISTS / DROP ... IF EXISTS, so re-running is
--   harmless.
--
-- ROLLBACK (destructive — deletes the history; ask before running)
--   drop table if exists public.media_kit_snapshots;
-- ===========================================================================

create table if not exists public.media_kit_snapshots (
  id bigint generated always as identity primary key,
  media_kit_id uuid not null references public.media_kits (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('youtube', 'twitch', 'kick', 'instagram')),
  -- Which official API produced the numbers. Self-reported values are never
  -- snapshotted: growth is only ever computed from API measurements.
  source text not null check (source in ('youtube_data_api', 'instagram_graph_api')),
  captured_on date not null default ((now() at time zone 'utc')::date),
  captured_at timestamptz not null default now(),
  subscriber_count bigint check (subscriber_count is null or subscriber_count >= 0),
  channel_view_count bigint check (channel_view_count is null or channel_view_count >= 0),
  media_count integer check (media_count is null or media_count >= 0),
  -- One measurement per kit per UTC day; a later sync the same day replaces it.
  constraint media_kit_snapshots_one_per_day unique (media_kit_id, captured_on)
);

comment on table public.media_kit_snapshots is
  'Dated platform-stats measurements for growth history. Server-written only (service role). Deleted after 29 days (YouTube Non-Authorized Data may not be stored for more than 30 days). Growth is computed only from two real snapshots on different days.';

create index if not exists media_kit_snapshots_kit_day_idx
  on public.media_kit_snapshots (media_kit_id, captured_on desc);
create index if not exists media_kit_snapshots_captured_at_idx
  on public.media_kit_snapshots (captured_at);
create index if not exists media_kit_snapshots_creator_idx
  on public.media_kit_snapshots (creator_id);

alter table public.media_kit_snapshots enable row level security;

revoke all on public.media_kit_snapshots from anon;
revoke all on public.media_kit_snapshots from authenticated;
grant select on public.media_kit_snapshots to authenticated;
-- Explicit rather than relying on Supabase's default privileges: the server
-- (service role) is the only writer.
grant select, insert, update, delete on public.media_kit_snapshots to service_role;

drop policy if exists media_kit_snapshots_select on public.media_kit_snapshots;
create policy media_kit_snapshots_select on public.media_kit_snapshots
  for select to authenticated
  using (creator_id = auth.uid() or private.is_admin());

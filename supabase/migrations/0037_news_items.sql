-- ===========================================================================
-- 0037: Official news headlines (gaming, esports, platform updates)
-- ===========================================================================
--
-- Spec: docs/G_CONTENT_INTELLIGENCE_ARCHITECTURE.md
--
-- WHAT
--   news_items: headline, link, publication time, retrieval time, source and
--   taxonomy tags of items from the allow-listed official feeds in
--   src/lib/news/sources.ts. No article text. Refreshed only by an admin
--   (/admin/news) or by a cron route that stays off until
--   NEWS_MONITORING_ENABLED=1 and CRON_SECRET are set and it is scheduled.
--   Items older than 60 days are deleted on each refresh.
--
-- WHO: signed-in users read (headlines are public); the server writes.
--
-- IDEMPOTENT. ROLLBACK: drop table if exists public.news_items;
-- ===========================================================================

create table if not exists public.news_items (
  id bigint generated always as identity primary key,
  source_id text not null check (source_id ~ '^[a-z0-9_]{2,40}$'),
  external_id text not null check (char_length(external_id) between 1 and 200),
  title text not null check (char_length(title) between 1 and 300),
  url text not null check (url ~ '^https://' and char_length(url) <= 1000),
  published_at timestamptz not null,
  retrieved_at timestamptz not null default now(),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  unique (source_id, external_id)
);
create index if not exists news_items_published_idx on public.news_items (published_at desc);
create index if not exists news_items_tags_idx on public.news_items using gin (tags);

alter table public.news_items enable row level security;
revoke all on public.news_items from anon, authenticated;
grant select on public.news_items to authenticated;
revoke all on public.news_items from service_role;
grant select, insert, update, delete on public.news_items to service_role;
grant usage, select on sequence public.news_items_id_seq to service_role;
drop policy if exists news_items_read on public.news_items;
create policy news_items_read on public.news_items for select to authenticated using (true);

comment on table public.news_items is
  'Headlines from allow-listed official feeds (0037). Headline, link, dates and source only; never article text.';

-- ===========================================================================
-- 0029 — Creator content planning
-- ===========================================================================
--
-- WHAT
--   content_items: a creator's private ideas and drafts (script, hook, title,
--   description), each with a status and an optional planned date for the
--   calendar. An item may be linked to one of the creator's own
--   collaborations, for example the script for a deliverable.
--
-- WHO
--   Owner only. Content plans are unpublished creative work: no other
--   creator, no company and no admin can read them through the API.
--   authenticated: SELECT of own rows. service_role: writes, which the server
--   scopes to the session's own id. A trigger refuses a non-creator owner, a
--   collaboration the creator is not party to, and more than 500 items.
--
-- PREREQUISITES
--   0001 (profiles), 0026 (collaborations).
--
-- IDEMPOTENT: if not exists / create or replace / drop ... if exists.
--
-- ROLLBACK (deletes every content item; ask first):
--   drop table if exists public.content_items;
--   drop function if exists private.check_content_item();
-- ===========================================================================

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('idea', 'script', 'hook', 'title', 'description')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text check (body is null or char_length(body) <= 20000),
  status text not null default 'idea' check (status in ('idea', 'drafting', 'ready', 'scheduled', 'published', 'archived')),
  platform text check (platform is null or platform in ('youtube', 'twitch', 'kick', 'instagram', 'tiktok', 'x', 'other')),
  planned_for date,
  tags text[] not null default '{}'::text[] check (cardinality(tags) <= 10),
  collaboration_id uuid references public.collaborations (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A scheduled item needs a date; nothing else does.
  constraint content_scheduled_has_date check (status <> 'scheduled' or planned_for is not null)
);
create index if not exists content_items_creator_idx on public.content_items (creator_id, updated_at desc);
create index if not exists content_items_calendar_idx on public.content_items (creator_id, planned_for) where planned_for is not null;

create or replace function private.check_content_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.creator_id and p.role = 'creator') then
    raise exception 'content:not_creator';
  end if;
  if new.collaboration_id is not null and not exists (
    select 1 from public.collaborations c where c.id = new.collaboration_id and c.creator_id = new.creator_id
  ) then
    raise exception 'content:collaboration';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.content_items i where i.creator_id = new.creator_id) >= 500 then
    raise exception 'content:too_many';
  end if;
  return new;
end;
$$;
revoke all on function private.check_content_item() from public, anon, authenticated;

drop trigger if exists content_items_check on public.content_items;
create trigger content_items_check before insert or update on public.content_items
  for each row execute function private.check_content_item();

alter table public.content_items enable row level security;
revoke all on public.content_items from anon, authenticated;
grant select on public.content_items to authenticated;
grant select, insert, update, delete on public.content_items to service_role;

drop policy if exists content_items_select on public.content_items;
create policy content_items_select on public.content_items for select to authenticated
  using (creator_id = (select auth.uid()));

comment on table public.content_items is
  'Creator content plans (0029): ideas and drafts with status and planned date. Owner-only; written by the server.';

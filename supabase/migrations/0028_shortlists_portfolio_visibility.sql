-- ===========================================================================
-- 0028 — Company shortlists, creator portfolio, public-profile visibility
-- ===========================================================================
--
-- WHAT
--   * shortlists / shortlist_entries: a company's private, named lists of
--     creators. Creators never see that they were shortlisted.
--   * portfolio_items: a creator's past work. Private by default; an item is
--     public only when the creator marks it so, and a brand is named publicly
--     only when the creator records that the brand agreed (brand_name_public).
--   * public_profile_settings: which sections the public /p/<slug> page shows.
--     With no row, the page behaves exactly as before 0028 (bio, location,
--     links, rate and platforms shown) and the new portfolio section is off.
--   * creator_public_profile(slug) is redefined with the same columns, now
--     returning NULL for a hidden section; creator_public_portfolio(slug) is
--     new and returns public items only, only when the section is on.
--
-- WHO
--   * anon: the two public RPCs only (as 0017).
--   * authenticated: SELECT on their own rows only (company: own shortlists;
--     creator: own portfolio and settings; admins: portfolio and settings,
--     read-only). Writes go through the server (service_role), which scopes
--     every statement to the session's own id.
--   * Triggers enforce what the server also checks: shortlist owners are
--     companies, entries are creators, portfolio owners are creators, and the
--     per-owner limits.
--
-- PREREQUISITES
--   0001 (profiles, media_kits), 0004 (private.is_admin), 0017
--   (creator_public_profile, shareable_slug).
--
-- IDEMPOTENT: if not exists / create or replace / drop ... if exists.
--
-- ROLLBACK (deletes all shortlists, portfolio items and settings; ask first):
--   drop function if exists public.creator_public_portfolio(text);
--   -- then re-run the creator_public_profile definition from 0017
--   drop table if exists public.shortlist_entries, public.shortlists,
--     public.portfolio_items, public.public_profile_settings;
--   drop function if exists private.check_shortlist(), private.check_shortlist_entry(),
--     private.check_portfolio_item();
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Shortlists (company-private)
-- ---------------------------------------------------------------------------
create table if not exists public.shortlists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shortlists_unique_name unique (company_id, name)
);

create table if not exists public.shortlist_entries (
  shortlist_id uuid not null references public.shortlists (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  note text check (note is null or char_length(note) <= 500),
  added_at timestamptz not null default now(),
  primary key (shortlist_id, creator_id)
);
create index if not exists shortlist_entries_creator_idx on public.shortlist_entries (creator_id);

create or replace function private.check_shortlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.company_id and p.role = 'company') then
    raise exception 'shortlist:not_company';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.shortlists s where s.company_id = new.company_id) >= 20 then
    raise exception 'shortlist:too_many';
  end if;
  return new;
end;
$$;

create or replace function private.check_shortlist_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.creator_id and p.role = 'creator' and p.banned_at is null) then
    raise exception 'shortlist:not_creator';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.shortlist_entries e where e.shortlist_id = new.shortlist_id) >= 200 then
    raise exception 'shortlist:too_many';
  end if;
  return new;
end;
$$;

drop trigger if exists shortlists_check on public.shortlists;
create trigger shortlists_check before insert or update on public.shortlists
  for each row execute function private.check_shortlist();
drop trigger if exists shortlist_entries_check on public.shortlist_entries;
create trigger shortlist_entries_check before insert or update on public.shortlist_entries
  for each row execute function private.check_shortlist_entry();

-- ---------------------------------------------------------------------------
-- Portfolio (creator-owned)
-- ---------------------------------------------------------------------------
create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text check (description is null or char_length(description) <= 1000),
  url text check (url is null or (url ~ '^https://' and char_length(url) <= 500)),
  platform text check (platform is null or platform in ('youtube', 'twitch', 'kick', 'instagram', 'tiktok', 'x', 'other')),
  brand_name text check (brand_name is null or char_length(btrim(brand_name)) between 1 and 80),
  -- The creator's record that the brand agreed to be named publicly.
  brand_name_public boolean not null default false,
  published_on date,
  is_public boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_brand_consent check (not brand_name_public or brand_name is not null)
);
create index if not exists portfolio_items_creator_idx on public.portfolio_items (creator_id, sort_order, created_at);

create or replace function private.check_portfolio_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.creator_id and p.role = 'creator') then
    raise exception 'portfolio:not_creator';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.portfolio_items i where i.creator_id = new.creator_id) >= 30 then
    raise exception 'portfolio:too_many';
  end if;
  return new;
end;
$$;

drop trigger if exists portfolio_items_check on public.portfolio_items;
create trigger portfolio_items_check before insert or update on public.portfolio_items
  for each row execute function private.check_portfolio_item();

-- ---------------------------------------------------------------------------
-- Public-profile section visibility
-- ---------------------------------------------------------------------------
create table if not exists public.public_profile_settings (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  show_bio boolean not null default true,
  show_location boolean not null default true,
  show_social_links boolean not null default true,
  show_rate boolean not null default true,
  show_platforms boolean not null default true,
  show_portfolio boolean not null default false,
  updated_at timestamptz not null default now()
);

revoke all on function private.check_shortlist(), private.check_shortlist_entry(), private.check_portfolio_item()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.shortlists enable row level security;
alter table public.shortlist_entries enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.public_profile_settings enable row level security;

revoke all on public.shortlists, public.shortlist_entries, public.portfolio_items, public.public_profile_settings
  from anon, authenticated;
grant select on public.shortlists, public.shortlist_entries, public.portfolio_items, public.public_profile_settings
  to authenticated;
grant select, insert, update, delete on public.shortlists, public.shortlist_entries, public.portfolio_items
  to service_role;
grant select, insert, update on public.public_profile_settings to service_role;

drop policy if exists shortlists_select on public.shortlists;
create policy shortlists_select on public.shortlists for select to authenticated
  using (company_id = (select auth.uid()));

drop policy if exists shortlist_entries_select on public.shortlist_entries;
create policy shortlist_entries_select on public.shortlist_entries for select to authenticated
  using (exists (select 1 from public.shortlists s where s.id = shortlist_entries.shortlist_id and s.company_id = (select auth.uid())));

drop policy if exists portfolio_items_select on public.portfolio_items;
create policy portfolio_items_select on public.portfolio_items for select to authenticated
  using (creator_id = (select auth.uid()) or private.is_admin());

drop policy if exists public_profile_settings_select on public.public_profile_settings;
create policy public_profile_settings_select on public.public_profile_settings for select to authenticated
  using (profile_id = (select auth.uid()) or private.is_admin());

-- ---------------------------------------------------------------------------
-- Public RPCs. Same columns as 0017; hidden sections come back NULL.
-- ---------------------------------------------------------------------------
create or replace function public.creator_public_profile(p_slug text)
returns table (
  full_name text,
  avatar_url text,
  bio text,
  country text,
  primary_language text,
  social_links jsonb,
  base_rate_usd numeric,
  platforms text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.full_name,
    p.avatar_url,
    case when coalesce(s.show_bio, true) then p.bio end,
    case when coalesce(s.show_location, true) then p.country end,
    case when coalesce(s.show_location, true) then p.primary_language end,
    case when coalesce(s.show_social_links, true) then p.social_links end,
    case when coalesce(s.show_rate, true) then p.base_rate_usd end,
    case when coalesce(s.show_platforms, true) then all_platforms.platforms end
  from public.profiles p
  left join public.public_profile_settings s on s.profile_id = p.id
  left join lateral (
    select array_agg(m.platform order by m.platform) as platforms
    from public.media_kits m
    where m.creator_id = p.id
  ) all_platforms on true
  where p.shareable_slug = p_slug
    and p.role = 'creator'
    and p.banned_at is null;
$$;

revoke all on function public.creator_public_profile(text) from public;
grant execute on function public.creator_public_profile(text) to anon, authenticated;

create or replace function public.creator_public_portfolio(p_slug text)
returns table (
  title text,
  description text,
  url text,
  platform text,
  brand_name text,
  published_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.title,
    i.description,
    i.url,
    i.platform,
    case when i.brand_name_public then i.brand_name end,
    i.published_on
  from public.profiles p
  join public.public_profile_settings s on s.profile_id = p.id and s.show_portfolio
  join public.portfolio_items i on i.creator_id = p.id and i.is_public
  where p.shareable_slug = p_slug
    and p.role = 'creator'
    and p.banned_at is null
  order by i.sort_order, i.created_at
  limit 30;
$$;

revoke all on function public.creator_public_portfolio(text) from public;
grant execute on function public.creator_public_portfolio(text) to anon, authenticated;

comment on function public.creator_public_profile(text) is
  'Public shareable-profile lookup by slug. Same columns as 0017 (never primary_email or inbound_alias); since 0028 a section the creator hid in public_profile_settings comes back NULL. Zero rows for a banned account, a non-creator, or an unknown slug.';
comment on function public.creator_public_portfolio(text) is
  'Public portfolio items for a slug (0028): only items marked public, only when the creator turned the portfolio section on, and a brand name only where the creator recorded the brand''s consent.';
comment on table public.shortlists is 'A company''s private creator lists (0028). Creators cannot see them.';
comment on table public.portfolio_items is 'Creator portfolio (0028). Private unless is_public; brand named publicly only with brand_name_public.';

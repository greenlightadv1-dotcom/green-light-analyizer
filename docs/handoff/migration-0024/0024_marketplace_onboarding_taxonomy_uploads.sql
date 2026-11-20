-- 0024 — Get Started applications, onboarding data, creator taxonomy,
-- company representatives, Discovery v2 and upload buckets.
--
-- LOCAL ONLY. Written for review; not applied to any remote project. Every
-- statement is additive or a function replacement, so existing rows and the
-- deployed code keep working before and after it runs:
--   * new profile columns default to empty / null;
--   * creator_directory() keeps every column it returned and adds new ones
--     at the end, so callers built against 0010 read the same fields;
--   * the two new tables and the two buckets start empty.
--
-- Accounts are still created only by an administrator (CLAUDE.md §4, Terms
-- §2). access_requests is the queue the public "Get Started" form writes to;
-- an admin reviews it and creates the account from it. Nothing here lets a
-- visitor create an auth user or a profile.

-- ---------------------------------------------------------------------------
-- 1. Profile data: creator taxonomy and company details
-- ---------------------------------------------------------------------------
-- Values are validated against src/lib/taxonomy.ts on the server before any
-- write; the constraints below only bound their size, so a new category is a
-- code change, not a migration.
alter table public.profiles
  add column if not exists creator_categories text[] not null default '{}',
  add column if not exists creator_games      text[] not null default '{}',
  add column if not exists content_formats    text[] not null default '{}',
  add column if not exists company_website    text,
  add column if not exists company_industry   text;

alter table public.profiles
  drop constraint if exists profiles_creator_categories_len,
  add constraint profiles_creator_categories_len check (cardinality(creator_categories) <= 6),
  drop constraint if exists profiles_creator_games_len,
  add constraint profiles_creator_games_len check (cardinality(creator_games) <= 12),
  drop constraint if exists profiles_content_formats_len,
  add constraint profiles_content_formats_len check (cardinality(content_formats) <= 8),
  drop constraint if exists profiles_company_website_len,
  add constraint profiles_company_website_len check (company_website is null or char_length(company_website) <= 200),
  drop constraint if exists profiles_company_industry_len,
  add constraint profiles_company_industry_len check (company_industry is null or char_length(company_industry) <= 60);

-- Deliberately NOT granted to authenticated. Every write goes through a
-- server action (service role) after taxonomy validation and, for the company
-- fields, the §6.1 contact-detail check; a client grant would let PostgREST
-- skip both. Revoked explicitly in case a default privilege granted it.
revoke update (creator_categories, creator_games, content_formats, company_website, company_industry)
  on public.profiles from anon, authenticated;

-- GIN indexes back Discovery's category / game filters.
create index if not exists profiles_creator_categories_gin on public.profiles using gin (creator_categories);
create index if not exists profiles_creator_games_gin on public.profiles using gin (creator_games);

-- ---------------------------------------------------------------------------
-- 2. Get Started applications
-- ---------------------------------------------------------------------------
create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  journey text not null check (journey in ('creator', 'company', 'company_representative')),
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text not null check (char_length(email) between 5 and 254),
  company_name text check (company_name is null or char_length(company_name) <= 120),
  website text check (website is null or char_length(website) <= 200),
  primary_platform text check (primary_platform is null or char_length(primary_platform) <= 40),
  channel_handle text check (channel_handle is null or char_length(channel_handle) <= 120),
  message text check (message is null or char_length(message) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_profile_id uuid references public.profiles (id) on delete set null
);

-- One open application per address: a resubmission updates nothing and is
-- answered the same way as the first, so the form cannot be used to learn
-- whether an address is already queued.
create unique index if not exists access_requests_one_pending_per_email
  on public.access_requests (lower(email)) where status = 'pending';
create index if not exists access_requests_status_created_idx
  on public.access_requests (status, created_at desc);

-- No policy for anon or authenticated: the form writes through the service
-- role after validation and rate limiting, and only admins read it, also
-- through the service role. RLS on with no policies = deny by default.
alter table public.access_requests enable row level security;
revoke all on public.access_requests from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Company representatives
-- ---------------------------------------------------------------------------
-- A representative is an ordinary role='company' account linked to the
-- company account it acts for. profiles.role is unchanged: there is no new
-- role, so every existing company permission applies to representatives too.
create table if not exists public.company_members (
  member_id uuid primary key references public.profiles (id) on delete cascade,
  company_id uuid not null references public.profiles (id) on delete cascade,
  member_role text not null check (member_role in ('owner', 'representative')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  check (member_role <> 'representative' or member_id <> company_id)
);
create index if not exists company_members_company_idx on public.company_members (company_id);

alter table public.company_members enable row level security;
revoke all on public.company_members from anon, authenticated;
grant select on public.company_members to authenticated;

drop policy if exists company_members_select on public.company_members;
create policy company_members_select on public.company_members
  for select to authenticated
  using (
    member_id = (select auth.uid())
    or company_id = (select auth.uid())
    or private.is_admin()
  );
-- Writes are admin-only, through the service role.

-- ---------------------------------------------------------------------------
-- 4. Discovery v2 — creator_directory() with taxonomy and freshness
-- ---------------------------------------------------------------------------
-- Return type changes, so the function is dropped and recreated. Same access
-- rule as 0010: zero rows unless the caller is a company or an admin. Same
-- no-PII column discipline: no email, alias, phone or bio.
--
-- Verified geography is returned only while the kit's verified_geo_synced_at
-- is under 30 days old (G1, 0023), so Discovery and G cannot present stale
-- data as verified even before the cleanup cron runs.
drop function if exists public.creator_directory();

create function public.creator_directory()
returns table (
  creator_id uuid,
  full_name text,
  region text,
  content_category text,
  content_language text,
  avg_views integer,
  avg_ccv integer,
  engagement_rate numeric,
  declared_top_countries jsonb,
  verified_top_countries jsonb,
  audience_verified boolean,
  platforms text[],
  avatar_url text,
  country text,
  creator_categories text[],
  creator_games text[],
  content_formats text[],
  base_rate_usd numeric,
  verified_geo_synced_at timestamptz,
  stats_synced_at timestamptz,
  shareable_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.full_name,
    p.region,
    best.content_category,
    best.content_language,
    best.avg_views,
    best.avg_ccv,
    best.engagement_rate,
    best.declared_top_countries,
    case
      when best.audience_verified
       and best.verified_geo_synced_at > now() - interval '30 days'
      then best.verified_top_countries
      else null
    end,
    coalesce(
      best.audience_verified and best.verified_geo_synced_at > now() - interval '30 days',
      false
    ),
    all_platforms.platforms,
    p.avatar_url,
    p.country,
    p.creator_categories,
    p.creator_games,
    p.content_formats,
    p.base_rate_usd,
    best.verified_geo_synced_at,
    best.youtube_stats_synced_at,
    -- Already public by design (the /p/<slug> page is reachable signed-out).
    p.shareable_slug
  from public.profiles p
  left join lateral (
    select m.content_category, m.content_language, m.avg_views, m.avg_ccv,
           m.engagement_rate, m.declared_top_countries, m.verified_top_countries,
           m.audience_verified, m.verified_geo_synced_at, m.youtube_stats_synced_at
    from public.media_kits m
    where m.creator_id = p.id
    order by m.avg_views desc nulls last
    limit 1
  ) best on true
  left join lateral (
    select array_agg(m2.platform order by m2.platform) as platforms
    from public.media_kits m2
    where m2.creator_id = p.id
  ) all_platforms on true
  where p.role = 'creator'
    and p.banned_at is null
    and exists (
      select 1 from public.profiles caller
      where caller.id = (select auth.uid())
        and caller.role in ('company', 'admin')
    );
$$;

revoke all on function public.creator_directory() from public;
revoke execute on function public.creator_directory() from anon;
grant execute on function public.creator_directory() to authenticated;

comment on function public.creator_directory() is
  'Company/admin-only creator directory (0010, extended in 0024): no PII, taxonomy, freshness-gated verified geography.';

-- ---------------------------------------------------------------------------
-- 5. Upload buckets
-- ---------------------------------------------------------------------------
-- Every upload goes through a server action that checks the caller, the
-- file's magic bytes and its size, then writes with the service role under
-- "<owner uuid>/...". There are deliberately no storage.objects policies for
-- authenticated users, so the browser cannot write, list or overwrite
-- anything directly.
--   avatars           — public read (shown on the public /p/<slug> page)
--   creator-documents — private; read only through short-lived signed URLs
--                       the server issues to the owner or an admin
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('creator-documents', 'creator-documents', false, 5242880,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

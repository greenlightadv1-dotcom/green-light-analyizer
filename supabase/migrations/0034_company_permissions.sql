-- ===========================================================================
-- 0034: Company representative permission scopes
-- ===========================================================================
--
-- Spec: docs/COMPANY_REPRESENTATIVES_PERMISSIONS.md
--
-- WHAT
--   * company_member_scopes: which scopes a company grants each of its
--     representatives (company_members, 0024). Least privilege: a link grants
--     nothing until the company grants a scope.
--   * company_permission_events: append-only history of every grant and revoke.
--   * company_set_scope(): the only write path. The company account itself (or
--     an admin) grants or revokes; one company can never touch another
--     company's representatives. Only scopes the product actually enforces
--     can be granted:
--       available           company.view, company.edit, discovery.view, briefs.view
--       approval required   invitations.send, deals.financial, members.manage
--                           (financial or contractual effect: owner decision)
--       not built yet       briefs.create, invitations.prepare,
--                           collaborations.access, deals.view
--   * private.member_has_scope(): checked by RLS and by the server on every
--     request, never cached, so a revoke takes effect on the next request.
--   * Enforcement in the database: briefs RLS (briefs.view) and
--     creator_directory() (discovery.view). The server checks company.view
--     and company.edit.
--   * Re-linking a representative to another company clears their scopes.
--
-- PREREQUISITES 0024 (company_members, creator_directory), 0026 (briefs).
-- IDEMPOTENT.
--
-- ROLLBACK (removes every grant; ask first): re-create creator_directory()
-- and briefs_select from 0024/0026, then
--   drop function if exists public.company_set_scope(uuid, uuid, text, boolean),
--     private.member_has_scope(uuid, uuid, text), private.is_representative(uuid);
--   drop table if exists public.company_permission_events, public.company_member_scopes;
-- ===========================================================================

create table if not exists public.company_member_scopes (
  member_id uuid not null references public.company_members (member_id) on delete cascade,
  company_id uuid not null references public.profiles (id) on delete cascade,
  scope text not null check (scope in (
    'company.view', 'company.edit', 'discovery.view', 'briefs.view',
    'briefs.create', 'invitations.prepare', 'invitations.send', 'collaborations.access',
    'deals.view', 'deals.financial', 'members.manage')),
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (member_id, scope)
);
create index if not exists company_member_scopes_company_idx on public.company_member_scopes (company_id);

create table if not exists public.company_permission_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.profiles (id) on delete cascade,
  member_id uuid not null,
  actor_id uuid references public.profiles (id) on delete set null,
  scope text not null,
  action text not null check (action in ('grant', 'revoke', 'cleared_on_relink')),
  created_at timestamptz not null default now()
);
create index if not exists company_permission_events_company_idx on public.company_permission_events (company_id, id);

create or replace function private.is_representative(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.company_members where member_id = p_uid and member_role = 'representative')
$$;

create or replace function private.member_has_scope(p_member uuid, p_company uuid, p_scope text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.company_member_scopes s
      join public.company_members m on m.member_id = s.member_id and m.company_id = s.company_id
      join public.profiles mp on mp.id = m.member_id
      join public.profiles cp on cp.id = m.company_id
     where s.member_id = p_member and s.company_id = p_company and s.scope = p_scope
       and m.member_role = 'representative'
       and mp.banned_at is null and cp.banned_at is null and cp.role = 'company')
$$;
revoke all on function private.is_representative(uuid) from public, anon;
revoke all on function private.member_has_scope(uuid, uuid, text) from public, anon;
grant execute on function private.is_representative(uuid) to authenticated, service_role;
grant execute on function private.member_has_scope(uuid, uuid, text) to authenticated, service_role;

-- The only write path. Raises 'perm:<code>'.
create or replace function public.company_set_scope(p_actor uuid, p_member uuid, p_scope text, p_grant boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.company_members%rowtype;
  v_actor public.profiles%rowtype;
begin
  select * into v_actor from public.profiles where id = p_actor;
  if not found or v_actor.banned_at is not null then raise exception 'perm:not_allowed'; end if;
  select * into m from public.company_members where member_id = p_member for update;
  if not found or m.member_role <> 'representative' then raise exception 'perm:not_found'; end if;
  -- The company account itself, never one of its representatives, or an admin.
  if not (v_actor.role = 'admin' or (v_actor.id = m.company_id and v_actor.role = 'company')) then
    raise exception 'perm:not_allowed';
  end if;
  if p_grant then
    if p_scope in ('invitations.send', 'deals.financial', 'members.manage') then raise exception 'perm:approval_required'; end if;
    if p_scope not in ('company.view', 'company.edit', 'discovery.view', 'briefs.view') then raise exception 'perm:not_available'; end if;
    insert into public.company_member_scopes (member_id, company_id, scope, granted_by)
    values (p_member, m.company_id, p_scope, p_actor)
    on conflict (member_id, scope) do nothing;
    if found then
      insert into public.company_permission_events (company_id, member_id, actor_id, scope, action) values (m.company_id, p_member, p_actor, p_scope, 'grant');
    end if;
  else
    delete from public.company_member_scopes where member_id = p_member and scope = p_scope;
    if found then
      insert into public.company_permission_events (company_id, member_id, actor_id, scope, action) values (m.company_id, p_member, p_actor, p_scope, 'revoke');
    end if;
  end if;
end;
$$;
revoke all on function public.company_set_scope(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.company_set_scope(uuid, uuid, text, boolean) to service_role;

-- Moving a representative to another company drops every scope from the old one.
create or replace function private.company_member_relinked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.company_id is distinct from old.company_id or new.member_role <> 'representative' then
    insert into public.company_permission_events (company_id, member_id, actor_id, scope, action)
    select s.company_id, s.member_id, null, s.scope, 'cleared_on_relink' from public.company_member_scopes s where s.member_id = old.member_id;
    delete from public.company_member_scopes where member_id = old.member_id;
  end if;
  return new;
end;
$$;
drop trigger if exists company_member_relinked on public.company_members;
create trigger company_member_relinked after update of company_id, member_role on public.company_members
  for each row execute function private.company_member_relinked();

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.company_member_scopes enable row level security;
alter table public.company_permission_events enable row level security;
revoke all on public.company_member_scopes, public.company_permission_events from anon, authenticated;
grant select on public.company_member_scopes, public.company_permission_events to authenticated;
revoke all on public.company_member_scopes from service_role;
grant select, insert, delete on public.company_member_scopes to service_role;
revoke all on public.company_permission_events from service_role;
grant select, insert on public.company_permission_events to service_role;

drop policy if exists company_member_scopes_select on public.company_member_scopes;
create policy company_member_scopes_select on public.company_member_scopes for select to authenticated
  using (member_id = (select auth.uid()) or company_id = (select auth.uid()) or private.is_admin());
drop policy if exists company_permission_events_select on public.company_permission_events;
create policy company_permission_events_select on public.company_permission_events for select to authenticated
  using (member_id = (select auth.uid()) or company_id = (select auth.uid()) or private.is_admin());

-- briefs.view: a representative reads the briefs of the company that granted it.
drop policy if exists briefs_select on public.briefs;
create policy briefs_select on public.briefs for select to authenticated using (
  company_id = (select auth.uid())
  or (status = 'published' and private.is_creator())
  or private.is_admin()
  or private.member_has_scope((select auth.uid()), company_id, 'briefs.view')
);

-- discovery.view: same function as 0024 with one extra condition on the caller.
create or replace function public.creator_directory()
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
        -- 0034: a representative searches creators only with discovery.view
        -- from the company they represent.
        and (
          caller.role = 'admin'
          or not private.is_representative(caller.id)
          or exists (select 1 from public.company_members cm
                      where cm.member_id = caller.id
                        and private.member_has_scope(caller.id, cm.company_id, 'discovery.view'))
        )
    );
$$;
revoke all on function public.creator_directory() from public;
revoke execute on function public.creator_directory() from anon;
grant execute on function public.creator_directory() to authenticated;

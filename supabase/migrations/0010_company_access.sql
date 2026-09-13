-- Company-side access (README "Not built: Company-side access").
--
-- Until now `company` had zero policies anywhere: a signed-in company saw an
-- empty inbox and could not reach a single deal_chats or messages row, even
-- one that named them as the company_id. This migration is the fix the
-- README already scoped out, built exactly the way it warned against getting
-- wrong: no policy is added to `profiles` for company rows. Doing that would
-- hand a company the whole creator row over PostgREST — primary_email and
-- inbound_alias included — because RLS gates rows, not columns, and Postgres
-- column privileges cannot be conditioned on "except when it's someone
-- else's row". `public.creator_directory()` below is a SECURITY DEFINER
-- function instead: its column list is fixed in the function body, not in a
-- grantable privilege, so there is no query shape that gets more out of it
-- than the columns it names.

-- 1. A creator's deal rooms are visible to the company on the other side of
--    them too, not only to the creator and admin.
create or replace function private.is_deal_participant(p_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.deal_chats d
    where d.id = p_chat_id
      and (d.creator_id = (select auth.uid()) or d.company_id = (select auth.uid()))
  );
$$;

drop policy if exists deal_chats_select on public.deal_chats;
create policy deal_chats_select on public.deal_chats
  for select
  to authenticated
  using (
    creator_id = (select auth.uid())
    or company_id = (select auth.uid())
    or private.is_admin()
  );

-- A company may insert directly too (defense in depth — the app's own write
-- path uses service_role, same as the creator-side Manual Analyzer, because
-- ai_evaluation/offered_amount are withheld from `authenticated` by column
-- grant regardless of what this policy allows).
drop policy if exists deal_chats_insert on public.deal_chats;
create policy deal_chats_insert on public.deal_chats
  for insert
  to authenticated
  with check (
    creator_id = (select auth.uid())
    or company_id = (select auth.uid())
    or private.is_admin()
  );

-- Either side may move the status forward (never to 'paid' — §12 escrow is
-- admin-reconciled, and that guard is unchanged below).
drop policy if exists deal_chats_update on public.deal_chats;
create policy deal_chats_update on public.deal_chats
  for update
  to authenticated
  using (
    creator_id = (select auth.uid())
    or company_id = (select auth.uid())
    or private.is_admin()
  )
  with check (
    private.is_admin()
    or (
      (creator_id = (select auth.uid()) or company_id = (select auth.uid()))
      and deal_status is distinct from 'paid'
    )
  );

comment on function private.is_deal_participant(uuid) is
  'True for the creator OR the company on a deal_chats row, or an admin. Backs messages_select/messages_insert so either party in the room can read and reply.';

-- 2. Media kits carry no contact PII — they are the creator's own public
--    pitch (§7) — so unlike profiles there is no column to leak by opening
--    row access to the company role. A company genuinely needs this to
--    evaluate a creator before sending an offer, and buildEvaluationInput()
--    already reads media_kits through the *caller's* client, so this one
--    policy is what makes a company-initiated offer price against the same
--    real reach data a creator's own analyzer run would use.
create or replace function private.is_company()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'company'
  );
$$;

drop policy if exists media_kits_select on public.media_kits;
create policy media_kits_select on public.media_kits
  for select
  to authenticated
  using (
    creator_id = (select auth.uid())
    or private.is_admin()
    or private.is_company()
  );

-- 3. The safe creator directory a company browses to start a deal.
--    SECURITY DEFINER on purpose: it bypasses profiles_select (which never
--    grows a policy for company rows, see above) but the SQL text itself
--    hardcodes the column list to id/full_name/region plus the same
--    no-PII media_kits fields already open above. There is no way to ask
--    this function for primary_email or inbound_alias — they are not
--    columns it selects, not columns it withholds.
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
  platforms text[]
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
    case when best.audience_verified then best.verified_top_countries else null end,
    coalesce(best.audience_verified, false),
    all_platforms.platforms
  from public.profiles p
  left join lateral (
    select m.content_category, m.content_language, m.avg_views, m.avg_ccv,
           m.engagement_rate, m.declared_top_countries, m.verified_top_countries,
           m.audience_verified
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
grant execute on function public.creator_directory() to authenticated;

comment on function public.creator_directory() is
  'Company-facing browse list. Returns only public.profiles.id/full_name/region plus no-PII media_kits fields, hardcoded in this function''s own SQL rather than gated by a grantable privilege. Returns zero rows unless the caller is a company or admin.';

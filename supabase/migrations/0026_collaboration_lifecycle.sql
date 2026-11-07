-- ===========================================================================
-- 0026 — Collaboration lifecycle: briefs, invitations, collaborations,
--        deliverables and an append-only event history.
--
-- PURPOSE
--   The company-to-creator workflow inside Green Light:
--     brief (draft → published → archived)
--     → invitation (pending ⇄ changes_requested → accepted | declined | withdrawn)
--     → collaboration (negotiating → active → completed | cancelled), opened
--       together with a masked deal room (deal_chats) for messaging
--     → deliverables (pending → submitted → approved | revision_requested → submitted …)
--   Every step is recorded in collaboration_events.
--
-- WHO MAY DO WHAT (enforced here, not only in the app)
--   * Every write goes through the SECURITY DEFINER functions below, which
--     only service_role may execute. The server passes the caller's id from
--     the session; each function re-checks that the actor is the right party
--     and that the transition is allowed from the row's current state, under
--     a row lock (FOR UPDATE), so a race cannot skip a step.
--   * anon: nothing. authenticated: SELECT only, through RLS.
--   * Company-side actions are taken by the company account itself.
--     Representatives (company_members) get no access, as before; whether
--     they may act for the company is an open owner decision.
--
-- NOT HERE (deliberately)
--   * No payment, escrow or commission arithmetic. Commission stays manual;
--     "agreed" terms are a record of what both sides confirmed. The linked
--     deal room still follows the existing deal_status rules (only an admin
--     marks a deal paid).
--   * No reviews/ratings: their visibility is an open owner decision.
--
-- PREREQUISITES
--   0001 (profiles, deal_chats), 0004 (private.is_admin), 0010
--   (private.is_company), 0022 (server-only deal writes). gen_random_uuid()
--   is built into Postgres 13+.
--
-- IDEMPOTENT
--   IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS throughout.
--
-- ROLLBACK (destructive — deletes every brief, invitation, collaboration,
-- deliverable and event; deal rooms already opened stay)
--   drop function if exists public.collab_create_invitation(uuid,uuid,uuid,text,numeric),
--     public.collab_withdraw_invitation(uuid,uuid), public.collab_revise_invitation(uuid,uuid,text,numeric),
--     public.collab_respond_invitation(uuid,uuid,text,text), public.collab_propose_terms(uuid,uuid,numeric,text),
--     public.collab_confirm_terms(uuid,uuid), public.collab_add_deliverable(uuid,uuid,text,text,date),
--     public.collab_remove_deliverable(uuid,uuid), public.collab_submit_deliverable(uuid,uuid,text,text),
--     public.collab_review_deliverable(uuid,uuid,text,text), public.collab_complete(uuid,uuid),
--     public.collab_cancel(uuid,uuid,text), public.collab_log(uuid,uuid,uuid,uuid,text,jsonb);
--   drop table if exists public.collaboration_events, public.deliverables,
--     public.collaborations, public.invitations, public.briefs;
--   drop function if exists private.is_creator();
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Helper: is the caller a creator? (Same shape as private.is_company.)
-- ---------------------------------------------------------------------------
create or replace function private.is_creator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'creator'
  );
$$;
revoke all on function private.is_creator() from public;
grant execute on function private.is_creator() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- briefs
-- ---------------------------------------------------------------------------
create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 10 and 5000),
  sponsorship_type text check (sponsorship_type in
    ('video_dedicated', 'integration', 'story_share', 'live_mention', 'post', 'other')),
  platforms text[] not null default '{}'
    check (platforms <@ array['youtube', 'twitch', 'kick', 'instagram', 'tiktok', 'x']::text[]),
  target_countries text[] not null default '{}' check (cardinality(target_countries) <= 20),
  categories text[] not null default '{}' check (cardinality(categories) <= 10),
  deliverables_summary text check (deliverables_summary is null or char_length(deliverables_summary) <= 2000),
  budget_min_usd numeric(10, 2) check (budget_min_usd is null or budget_min_usd >= 0),
  budget_max_usd numeric(10, 2) check (budget_max_usd is null or budget_max_usd >= 0),
  start_date date,
  due_date date,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint briefs_budget_order check (budget_min_usd is null or budget_max_usd is null or budget_max_usd >= budget_min_usd),
  constraint briefs_date_order check (start_date is null or due_date is null or due_date >= start_date),
  -- Lets invitations reference (id, company_id) so an invitation can never
  -- point at another company's brief.
  constraint briefs_id_company_unique unique (id, company_id)
);
comment on table public.briefs is
  'Company campaign briefs. Drafts and archives are visible to their company only; published briefs are readable by creators. Written by the server only.';
create index if not exists briefs_company_idx on public.briefs (company_id, created_at desc);
create index if not exists briefs_published_idx on public.briefs (published_at desc) where status = 'published';

-- ---------------------------------------------------------------------------
-- invitations
-- ---------------------------------------------------------------------------
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null,
  company_id uuid not null,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000),
  proposed_amount_usd numeric(10, 2) check (proposed_amount_usd is null or proposed_amount_usd >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'changes_requested', 'accepted', 'declined', 'withdrawn')),
  response_note text check (response_note is null or char_length(response_note) <= 2000),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitations_brief_company_fk foreign key (brief_id, company_id)
    references public.briefs (id, company_id) on delete cascade,
  -- One invitation per creator per brief.
  constraint invitations_one_per_creator unique (brief_id, creator_id),
  constraint invitations_not_self check (creator_id <> company_id)
);
create index if not exists invitations_creator_idx on public.invitations (creator_id, created_at desc);
create index if not exists invitations_company_idx on public.invitations (company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- collaborations
-- ---------------------------------------------------------------------------
create table if not exists public.collaborations (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null unique references public.invitations (id) on delete cascade,
  brief_id uuid not null references public.briefs (id) on delete cascade,
  company_id uuid not null references public.profiles (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  deal_chat_id uuid references public.deal_chats (id) on delete set null,
  status text not null default 'negotiating'
    check (status in ('negotiating', 'active', 'completed', 'cancelled')),
  proposed_amount_usd numeric(10, 2) check (proposed_amount_usd is null or proposed_amount_usd >= 0),
  proposed_terms text check (proposed_terms is null or char_length(proposed_terms) <= 5000),
  proposed_by uuid references public.profiles (id) on delete set null,
  company_confirmed_at timestamptz,
  creator_confirmed_at timestamptz,
  agreed_amount_usd numeric(10, 2),
  agreed_terms text,
  agreed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An active or completed collaboration always carries the agreed terms.
  constraint collaborations_agreed_has_terms check (
    status not in ('active', 'completed') or (agreed_at is not null and agreed_terms is not null)
  )
);
create index if not exists collaborations_company_idx on public.collaborations (company_id, updated_at desc);
create index if not exists collaborations_creator_idx on public.collaborations (creator_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- deliverables
-- ---------------------------------------------------------------------------
create table if not exists public.deliverables (
  id uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references public.collaborations (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text check (description is null or char_length(description) <= 2000),
  due_date date,
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'revision_requested', 'approved')),
  submission_url text check (submission_url is null or (char_length(submission_url) <= 500 and submission_url ~ '^https://')),
  submission_note text check (submission_note is null or char_length(submission_note) <= 2000),
  submitted_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 2000),
  reviewed_at timestamptz,
  approved_at timestamptz,
  revision_count integer not null default 0 check (revision_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deliverables_collab_idx on public.deliverables (collaboration_id, created_at);

-- ---------------------------------------------------------------------------
-- collaboration_events — append-only history
-- ---------------------------------------------------------------------------
create table if not exists public.collaboration_events (
  id bigint generated always as identity primary key,
  invitation_id uuid references public.invitations (id) on delete cascade,
  collaboration_id uuid references public.collaborations (id) on delete cascade,
  deliverable_id uuid references public.deliverables (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  event_type text not null check (event_type in (
    'invitation_sent', 'invitation_revised', 'invitation_withdrawn', 'invitation_declined',
    'changes_requested', 'invitation_accepted', 'terms_proposed', 'terms_confirmed', 'terms_agreed',
    'deliverable_added', 'deliverable_removed', 'deliverable_submitted', 'revision_requested',
    'deliverable_approved', 'collaboration_completed', 'collaboration_cancelled')),
  -- Only ids, statuses and amounts: never message, note or terms text.
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint collaboration_events_has_subject check (invitation_id is not null or collaboration_id is not null)
);
create index if not exists collaboration_events_collab_idx on public.collaboration_events (collaboration_id, id);
create index if not exists collaboration_events_invitation_idx on public.collaboration_events (invitation_id, id);

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.briefs enable row level security;
alter table public.invitations enable row level security;
alter table public.collaborations enable row level security;
alter table public.deliverables enable row level security;
alter table public.collaboration_events enable row level security;

revoke all on public.briefs, public.invitations, public.collaborations,
  public.deliverables, public.collaboration_events from anon, authenticated;
grant select on public.briefs, public.invitations, public.collaborations,
  public.deliverables, public.collaboration_events to authenticated;
grant select, insert, update, delete on public.briefs, public.invitations,
  public.collaborations, public.deliverables to service_role;
-- History is append-only, even for the server.
revoke all on public.collaboration_events from service_role;
grant select, insert on public.collaboration_events to service_role;

drop policy if exists briefs_select on public.briefs;
create policy briefs_select on public.briefs for select to authenticated using (
  company_id = (select auth.uid())
  or (status = 'published' and private.is_creator())
  or private.is_admin()
);

drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations for select to authenticated using (
  company_id = (select auth.uid()) or creator_id = (select auth.uid()) or private.is_admin()
);

drop policy if exists collaborations_select on public.collaborations;
create policy collaborations_select on public.collaborations for select to authenticated using (
  company_id = (select auth.uid()) or creator_id = (select auth.uid()) or private.is_admin()
);

drop policy if exists deliverables_select on public.deliverables;
create policy deliverables_select on public.deliverables for select to authenticated using (
  exists (
    select 1 from public.collaborations c
    where c.id = deliverables.collaboration_id
      and (c.company_id = (select auth.uid()) or c.creator_id = (select auth.uid()))
  ) or private.is_admin()
);

drop policy if exists collaboration_events_select on public.collaboration_events;
create policy collaboration_events_select on public.collaboration_events for select to authenticated using (
  exists (
    select 1 from public.invitations i
    where i.id = collaboration_events.invitation_id
      and (i.company_id = (select auth.uid()) or i.creator_id = (select auth.uid()))
  )
  or exists (
    select 1 from public.collaborations c
    where c.id = collaboration_events.collaboration_id
      and (c.company_id = (select auth.uid()) or c.creator_id = (select auth.uid()))
  )
  or private.is_admin()
);

-- ---------------------------------------------------------------------------
-- Transition functions. Raise 'collab:<code>' (SQLSTATE P0001) on refusal;
-- the app maps the code to a translated message.
-- ---------------------------------------------------------------------------
create or replace function public.collab_log(
  p_actor uuid, p_invitation uuid, p_collab uuid, p_deliverable uuid, p_type text, p_detail jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.collaboration_events (actor_id, invitation_id, collaboration_id, deliverable_id, event_type, detail)
  values (p_actor, p_invitation, p_collab, p_deliverable, p_type, coalesce(p_detail, '{}'::jsonb));
$$;

create or replace function public.collab_create_invitation(
  p_company uuid, p_brief uuid, p_creator uuid, p_message text, p_amount numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_brief public.briefs;
  v_id uuid;
begin
  select * into v_brief from public.briefs where id = p_brief for share;
  if v_brief.id is null or v_brief.company_id <> p_company then raise exception 'collab:not_found'; end if;
  if v_brief.status <> 'published' then raise exception 'collab:brief_not_published'; end if;
  if not exists (select 1 from public.profiles where id = p_creator and role = 'creator' and banned_at is null) then
    raise exception 'collab:creator_not_found';
  end if;
  if exists (select 1 from public.invitations where brief_id = p_brief and creator_id = p_creator) then
    raise exception 'collab:already_invited';
  end if;
  insert into public.invitations (brief_id, company_id, creator_id, message, proposed_amount_usd)
  values (p_brief, p_company, p_creator, p_message, p_amount)
  returning id into v_id;
  perform public.collab_log(p_company, v_id, null, null, 'invitation_sent',
    jsonb_build_object('brief_id', p_brief, 'amount', p_amount));
  return v_id;
end $$;

create or replace function public.collab_withdraw_invitation(p_company uuid, p_invitation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.invitations;
begin
  select * into v from public.invitations where id = p_invitation for update;
  if v.id is null or v.company_id <> p_company then raise exception 'collab:not_found'; end if;
  if v.status not in ('pending', 'changes_requested') then raise exception 'collab:invalid_state'; end if;
  update public.invitations set status = 'withdrawn', updated_at = now() where id = p_invitation;
  perform public.collab_log(p_company, p_invitation, null, null, 'invitation_withdrawn', '{}');
end $$;

create or replace function public.collab_revise_invitation(
  p_company uuid, p_invitation uuid, p_message text, p_amount numeric
) returns void language plpgsql security definer set search_path = '' as $$
declare v public.invitations;
begin
  select * into v from public.invitations where id = p_invitation for update;
  if v.id is null or v.company_id <> p_company then raise exception 'collab:not_found'; end if;
  if v.status <> 'changes_requested' then raise exception 'collab:invalid_state'; end if;
  update public.invitations
    set message = p_message, proposed_amount_usd = p_amount, status = 'pending', updated_at = now()
    where id = p_invitation;
  perform public.collab_log(p_company, p_invitation, null, null, 'invitation_revised', jsonb_build_object('amount', p_amount));
end $$;

-- accept opens the collaboration and its masked deal room in one transaction.
create or replace function public.collab_respond_invitation(
  p_creator uuid, p_invitation uuid, p_response text, p_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.invitations;
  b public.briefs;
  v_company_email text;
  v_chat uuid;
  v_collab uuid;
begin
  select * into v from public.invitations where id = p_invitation for update;
  if v.id is null or v.creator_id <> p_creator then raise exception 'collab:not_found'; end if;

  if p_response = 'decline' then
    if v.status not in ('pending', 'changes_requested') then raise exception 'collab:invalid_state'; end if;
    update public.invitations set status = 'declined', response_note = p_note, responded_at = now(), updated_at = now()
      where id = p_invitation;
    perform public.collab_log(p_creator, p_invitation, null, null, 'invitation_declined', '{}');
    return null;
  elsif p_response = 'request_changes' then
    if v.status <> 'pending' then raise exception 'collab:invalid_state'; end if;
    if p_note is null or char_length(btrim(p_note)) = 0 then raise exception 'collab:note_required'; end if;
    update public.invitations set status = 'changes_requested', response_note = p_note, responded_at = now(), updated_at = now()
      where id = p_invitation;
    perform public.collab_log(p_creator, p_invitation, null, null, 'changes_requested', '{}');
    return null;
  elsif p_response = 'accept' then
    if v.status <> 'pending' then raise exception 'collab:invalid_state'; end if;
    select * into b from public.briefs where id = v.brief_id;
    if b.status <> 'published' then raise exception 'collab:brief_not_published'; end if;
    select primary_email into v_company_email from public.profiles where id = v.company_id;
    -- Same shape as a Discover offer's deal room: company_id set, status
    -- negotiating. Messaging happens there, through the existing mask.
    insert into public.deal_chats (creator_id, company_id, sender_email, deal_status, offered_amount,
                                   sponsorship_type, target_countries)
    values (v.creator_id, v.company_id, v_company_email, 'negotiating', v.proposed_amount_usd,
            b.sponsorship_type, nullif(b.target_countries, '{}'))
    returning id into v_chat;
    insert into public.collaborations (invitation_id, brief_id, company_id, creator_id, deal_chat_id,
                                       proposed_amount_usd, proposed_by)
    values (v.id, v.brief_id, v.company_id, v.creator_id, v_chat, v.proposed_amount_usd, v.company_id)
    returning id into v_collab;
    update public.invitations set status = 'accepted', response_note = p_note, responded_at = now(), updated_at = now()
      where id = p_invitation;
    perform public.collab_log(p_creator, p_invitation, v_collab, null, 'invitation_accepted',
      jsonb_build_object('deal_chat_id', v_chat));
    return v_collab;
  else
    raise exception 'collab:invalid_input';
  end if;
end $$;

-- Either party proposes terms; any new proposal clears both confirmations.
create or replace function public.collab_propose_terms(
  p_actor uuid, p_collab uuid, p_amount numeric, p_terms text
) returns void language plpgsql security definer set search_path = '' as $$
declare c public.collaborations;
begin
  select * into c from public.collaborations where id = p_collab for update;
  if c.id is null or p_actor not in (c.company_id, c.creator_id) then raise exception 'collab:not_found'; end if;
  if c.status <> 'negotiating' then raise exception 'collab:invalid_state'; end if;
  if p_amount is null or p_amount < 0 or p_terms is null or char_length(btrim(p_terms)) < 10 then
    raise exception 'collab:invalid_input';
  end if;
  update public.collaborations
    set proposed_amount_usd = p_amount, proposed_terms = p_terms, proposed_by = p_actor,
        company_confirmed_at = null, creator_confirmed_at = null, updated_at = now()
    where id = p_collab;
  perform public.collab_log(p_actor, c.invitation_id, p_collab, null, 'terms_proposed', jsonb_build_object('amount', p_amount));
end $$;

-- Each side confirms the current proposal; when both have, the terms are
-- frozen as agreed, the collaboration becomes active, and the linked deal
-- room moves to 'agreed' (never past it: 'paid' stays admin-only).
create or replace function public.collab_confirm_terms(p_actor uuid, p_collab uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.collaborations;
begin
  select * into c from public.collaborations where id = p_collab for update;
  if c.id is null or p_actor not in (c.company_id, c.creator_id) then raise exception 'collab:not_found'; end if;
  if c.status <> 'negotiating' then raise exception 'collab:invalid_state'; end if;
  if c.proposed_terms is null or c.proposed_amount_usd is null then raise exception 'collab:no_terms'; end if;
  if p_actor = c.company_id then
    update public.collaborations set company_confirmed_at = now(), updated_at = now() where id = p_collab;
  else
    update public.collaborations set creator_confirmed_at = now(), updated_at = now() where id = p_collab;
  end if;
  perform public.collab_log(p_actor, c.invitation_id, p_collab, null, 'terms_confirmed', '{}');
  select * into c from public.collaborations where id = p_collab;
  if c.company_confirmed_at is not null and c.creator_confirmed_at is not null then
    update public.collaborations
      set status = 'active', agreed_amount_usd = c.proposed_amount_usd, agreed_terms = c.proposed_terms,
          agreed_at = now(), updated_at = now()
      where id = p_collab;
    if c.deal_chat_id is not null then
      update public.deal_chats set deal_status = 'agreed', offered_amount = c.proposed_amount_usd
        where id = c.deal_chat_id and deal_status in ('new', 'negotiating');
    end if;
    perform public.collab_log(p_actor, c.invitation_id, p_collab, null, 'terms_agreed',
      jsonb_build_object('amount', c.proposed_amount_usd));
    return 'active';
  end if;
  return 'negotiating';
end $$;

create or replace function public.collab_add_deliverable(
  p_company uuid, p_collab uuid, p_title text, p_description text, p_due date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.collaborations; v_id uuid;
begin
  select * into c from public.collaborations where id = p_collab for update;
  if c.id is null or c.company_id <> p_company then raise exception 'collab:not_found'; end if;
  if c.status not in ('negotiating', 'active') then raise exception 'collab:invalid_state'; end if;
  if (select count(*) from public.deliverables where collaboration_id = p_collab) >= 30 then
    raise exception 'collab:too_many';
  end if;
  insert into public.deliverables (collaboration_id, title, description, due_date)
  values (p_collab, p_title, p_description, p_due) returning id into v_id;
  perform public.collab_log(p_company, c.invitation_id, p_collab, v_id, 'deliverable_added', '{}');
  return v_id;
end $$;

create or replace function public.collab_remove_deliverable(p_company uuid, p_deliverable uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.deliverables; c public.collaborations;
begin
  select * into d from public.deliverables where id = p_deliverable for update;
  if d.id is null then raise exception 'collab:not_found'; end if;
  select * into c from public.collaborations where id = d.collaboration_id for update;
  if c.company_id <> p_company then raise exception 'collab:not_found'; end if;
  -- Only work that was never submitted can be removed; history stays intact.
  if d.status <> 'pending' or d.submitted_at is not null or c.status not in ('negotiating', 'active') then
    raise exception 'collab:invalid_state';
  end if;
  perform public.collab_log(p_company, c.invitation_id, c.id, null, 'deliverable_removed', jsonb_build_object('title', d.title));
  delete from public.deliverables where id = p_deliverable;
end $$;

create or replace function public.collab_submit_deliverable(
  p_creator uuid, p_deliverable uuid, p_url text, p_note text
) returns void language plpgsql security definer set search_path = '' as $$
declare d public.deliverables; c public.collaborations;
begin
  select * into d from public.deliverables where id = p_deliverable for update;
  if d.id is null then raise exception 'collab:not_found'; end if;
  select * into c from public.collaborations where id = d.collaboration_id for update;
  if c.creator_id <> p_creator then raise exception 'collab:not_found'; end if;
  if c.status <> 'active' then raise exception 'collab:not_active'; end if;
  if d.status not in ('pending', 'revision_requested') then raise exception 'collab:invalid_state'; end if;
  if (p_url is null or btrim(p_url) = '') and (p_note is null or btrim(p_note) = '') then
    raise exception 'collab:invalid_input';
  end if;
  update public.deliverables
    set status = 'submitted', submission_url = nullif(btrim(p_url), ''), submission_note = p_note,
        submitted_at = now(), updated_at = now()
    where id = p_deliverable;
  perform public.collab_log(p_creator, c.invitation_id, c.id, d.id, 'deliverable_submitted',
    jsonb_build_object('revision', d.revision_count));
end $$;

create or replace function public.collab_review_deliverable(
  p_company uuid, p_deliverable uuid, p_decision text, p_note text
) returns void language plpgsql security definer set search_path = '' as $$
declare d public.deliverables; c public.collaborations;
begin
  select * into d from public.deliverables where id = p_deliverable for update;
  if d.id is null then raise exception 'collab:not_found'; end if;
  select * into c from public.collaborations where id = d.collaboration_id for update;
  if c.company_id <> p_company then raise exception 'collab:not_found'; end if;
  if c.status <> 'active' then raise exception 'collab:not_active'; end if;
  if d.status <> 'submitted' then raise exception 'collab:invalid_state'; end if;
  if p_decision = 'approve' then
    update public.deliverables
      set status = 'approved', review_note = p_note, reviewed_at = now(), approved_at = now(), updated_at = now()
      where id = p_deliverable;
    perform public.collab_log(p_company, c.invitation_id, c.id, d.id, 'deliverable_approved', '{}');
  elsif p_decision = 'revise' then
    if p_note is null or char_length(btrim(p_note)) = 0 then raise exception 'collab:note_required'; end if;
    update public.deliverables
      set status = 'revision_requested', review_note = p_note, reviewed_at = now(),
          revision_count = revision_count + 1, updated_at = now()
      where id = p_deliverable;
    perform public.collab_log(p_company, c.invitation_id, c.id, d.id, 'revision_requested',
      jsonb_build_object('revision', d.revision_count + 1));
  else
    raise exception 'collab:invalid_input';
  end if;
end $$;

-- The company closes the collaboration once every deliverable is approved.
create or replace function public.collab_complete(p_company uuid, p_collab uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.collaborations;
begin
  select * into c from public.collaborations where id = p_collab for update;
  if c.id is null or c.company_id <> p_company then raise exception 'collab:not_found'; end if;
  if c.status <> 'active' then raise exception 'collab:not_active'; end if;
  if not exists (select 1 from public.deliverables where collaboration_id = p_collab) then
    raise exception 'collab:no_deliverables';
  end if;
  if exists (select 1 from public.deliverables where collaboration_id = p_collab and status <> 'approved') then
    raise exception 'collab:deliverables_open';
  end if;
  update public.collaborations set status = 'completed', completed_at = now(), updated_at = now() where id = p_collab;
  perform public.collab_log(p_company, c.invitation_id, p_collab, null, 'collaboration_completed', '{}');
end $$;

create or replace function public.collab_cancel(p_actor uuid, p_collab uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.collaborations;
begin
  select * into c from public.collaborations where id = p_collab for update;
  if c.id is null or p_actor not in (c.company_id, c.creator_id) then raise exception 'collab:not_found'; end if;
  if c.status not in ('negotiating', 'active') then raise exception 'collab:invalid_state'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'collab:note_required'; end if;
  update public.collaborations
    set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor, cancel_reason = p_reason, updated_at = now()
    where id = p_collab;
  perform public.collab_log(p_actor, c.invitation_id, p_collab, null, 'collaboration_cancelled',
    jsonb_build_object('from_status', c.status));
end $$;

-- Only the server may call the transition functions.
do $$
declare f text;
begin
  foreach f in array array[
    'public.collab_log(uuid,uuid,uuid,uuid,text,jsonb)',
    'public.collab_create_invitation(uuid,uuid,uuid,text,numeric)',
    'public.collab_withdraw_invitation(uuid,uuid)',
    'public.collab_revise_invitation(uuid,uuid,text,numeric)',
    'public.collab_respond_invitation(uuid,uuid,text,text)',
    'public.collab_propose_terms(uuid,uuid,numeric,text)',
    'public.collab_confirm_terms(uuid,uuid)',
    'public.collab_add_deliverable(uuid,uuid,text,text,date)',
    'public.collab_remove_deliverable(uuid,uuid)',
    'public.collab_submit_deliverable(uuid,uuid,text,text)',
    'public.collab_review_deliverable(uuid,uuid,text,text)',
    'public.collab_complete(uuid,uuid)',
    'public.collab_cancel(uuid,uuid,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

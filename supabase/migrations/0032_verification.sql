-- ===========================================================================
-- 0032 — Account status, creator KYC, company KYB, representative authorization
-- ===========================================================================
--
-- Specs: docs/CREATOR_KYC_SPEC.md, docs/COMPANY_KYB_SPEC.md,
--        docs/COMPANY_REPRESENTATIVES_PERMISSIONS.md
--
-- WHAT
--   * profiles.account_status: 'active' (default, so every existing account is
--     unchanged), 'pending_verification' (a self-registered account before an
--     admin approves it), 'rejected'. Only the server writes it.
--   * verification_cases: one case per person and kind (creator_kyc,
--     company_kyb, representative), with a state machine
--       draft → submitted → under_review → approved | rejected
--                      ↘ needs_info → submitted (resubmission)
--   * verification_documents: metadata of files in the private bucket
--     'verification-docs'. Files are reachable only through short signed URLs
--     the server issues to admins.
--   * verification_events: append-only history (who did what, when).
--
-- WHAT IT DOES NOT CLAIM
--   An admin approving uploaded documents records method
--   'manual_document_review'. No face match or liveness check exists: no
--   provider is integrated, and the product must not call an account
--   "identity verified" on documents alone (the UI says "documents reviewed").
--   'provider' is reserved and requires a provider reference.
--
-- WHO
--   * anon: nothing.
--   * authenticated: SELECT of their own cases, documents and events; admins
--     read all. No client writes.
--   * service_role: drafts and documents (server actions, after validation)
--     and every transition, through verification_transition(), which checks
--     the actor and the state and writes the history in the same transaction.
--
-- PREREQUISITES 0001, 0004 (private.is_admin), 0024 (company_members).
-- IDEMPOTENT.
--
-- ROLLBACK (deletes all verification data; files must be removed from the
-- bucket separately; ask first):
--   drop function if exists public.verification_transition(uuid, uuid, text, text, uuid);
--   drop table if exists public.verification_events, public.verification_documents, public.verification_cases;
--   alter table public.profiles drop column if exists account_status;
--   delete from storage.buckets where id = 'verification-docs';
-- ===========================================================================

alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status in ('pending_verification', 'active', 'rejected'));
comment on column public.profiles.account_status is
  'active (default) | pending_verification (self-registered, awaiting admin approval) | rejected. Server-written only (0032).';

create table if not exists public.verification_cases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('creator_kyc', 'company_kyb', 'representative')),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'under_review', 'needs_info', 'approved', 'rejected')),
  -- Validated form fields. Never documents, never full ID numbers.
  details jsonb not null default '{}'::jsonb,
  -- Representative cases: the company account they represent (set by an admin).
  company_profile_id uuid references public.profiles (id) on delete set null,
  method text check (method is null or method in ('manual_document_review', 'provider')),
  provider_ref text,
  info_request text check (info_request is null or char_length(info_request) <= 1000),
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 1000),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verification_provider_needs_ref check (method is distinct from 'provider' or provider_ref is not null),
  constraint verification_rep_not_self check (company_profile_id is distinct from profile_id)
);
create unique index if not exists verification_cases_one_per_kind on public.verification_cases (profile_id, kind);
create index if not exists verification_cases_queue_idx on public.verification_cases (status, submitted_at);

create table if not exists public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.verification_cases (id) on delete cascade,
  doc_type text not null check (doc_type in (
    'id_front', 'id_back', 'passport', 'commercial_register', 'tax_card', 'authorization_letter', 'other')),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  uploaded_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists verification_documents_case_idx on public.verification_documents (case_id) where removed_at is null;

create table if not exists public.verification_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.verification_cases (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  event text not null check (event in (
    'created', 'submitted', 'review_started', 'info_requested', 'approved', 'rejected',
    'document_added', 'document_removed', 'document_viewed')),
  -- Ids and codes only, never document contents or personal details.
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists verification_events_case_idx on public.verification_events (case_id, id);

-- ---------------------------------------------------------------------------
-- Transitions. service_role only; raises 'verification:<code>'.
-- ---------------------------------------------------------------------------
create or replace function public.verification_transition(
  p_actor uuid, p_case uuid, p_action text, p_note text default null, p_company uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.verification_cases%rowtype;
  v_admin boolean;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_docs text[];
begin
  select * into c from public.verification_cases where id = p_case for update;
  if not found then raise exception 'verification:not_found'; end if;
  select coalesce(role = 'admin', false) into v_admin from public.profiles where id = p_actor;

  if p_action = 'submit' then
    if p_actor <> c.profile_id then raise exception 'verification:not_found'; end if;
    if c.status not in ('draft', 'needs_info') then raise exception 'verification:invalid_state'; end if;
    select coalesce(array_agg(doc_type), '{}') into v_docs
      from public.verification_documents where case_id = c.id and removed_at is null;
    if c.kind = 'creator_kyc' and not (v_docs && array['id_front', 'passport']) then
      raise exception 'verification:documents_missing';
    end if;
    if c.kind = 'company_kyb' and not (v_docs @> array['commercial_register', 'tax_card']) then
      raise exception 'verification:documents_missing';
    end if;
    if c.kind = 'representative' and not (v_docs @> array['authorization_letter']) then
      raise exception 'verification:documents_missing';
    end if;
    update public.verification_cases
       set status = 'submitted', submitted_at = now(), info_request = null, updated_at = now()
     where id = c.id;
    insert into public.verification_events (case_id, actor_id, event) values (c.id, p_actor, 'submitted');
    return 'submitted';
  end if;

  if not v_admin or p_actor = c.profile_id then raise exception 'verification:not_allowed'; end if;

  if p_action = 'start_review' then
    if c.status <> 'submitted' then raise exception 'verification:invalid_state'; end if;
    update public.verification_cases set status = 'under_review', updated_at = now() where id = c.id;
    insert into public.verification_events (case_id, actor_id, event) values (c.id, p_actor, 'review_started');
    return 'under_review';

  elsif p_action = 'request_info' then
    if c.status not in ('submitted', 'under_review') then raise exception 'verification:invalid_state'; end if;
    if v_note is null then raise exception 'verification:note_required'; end if;
    update public.verification_cases
       set status = 'needs_info', info_request = left(v_note, 1000), reviewed_by = p_actor, updated_at = now()
     where id = c.id;
    insert into public.verification_events (case_id, actor_id, event) values (c.id, p_actor, 'info_requested');
    return 'needs_info';

  elsif p_action = 'approve' then
    if c.status not in ('submitted', 'under_review') then raise exception 'verification:invalid_state'; end if;
    if c.kind = 'representative' then
      if p_company is null or not exists (select 1 from public.profiles where id = p_company and role = 'company') then
        raise exception 'verification:company_required';
      end if;
      if p_company = c.profile_id then raise exception 'verification:company_required'; end if;
    end if;
    update public.verification_cases
       set status = 'approved', method = 'manual_document_review', decision_reason = left(v_note, 1000),
           company_profile_id = coalesce(p_company, company_profile_id),
           reviewed_by = p_actor, reviewed_at = now(), updated_at = now()
     where id = c.id;
    update public.profiles set account_status = 'active'
     where id = c.profile_id and account_status = 'pending_verification';
    if c.kind = 'representative' then
      -- The link 0024 already models. It grants no access to the company's
      -- deals (docs/COMPANY_REPRESENTATIVES_PERMISSIONS.md).
      insert into public.company_members (member_id, company_id, member_role, created_by)
      values (c.profile_id, p_company, 'representative', p_actor)
      on conflict (member_id) do update set company_id = excluded.company_id, created_by = excluded.created_by
        where public.company_members.member_role = 'representative';
    end if;
    insert into public.verification_events (case_id, actor_id, event, detail)
    values (c.id, p_actor, 'approved', jsonb_build_object('method', 'manual_document_review'));
    return 'approved';

  elsif p_action = 'reject' then
    if c.status not in ('submitted', 'under_review', 'needs_info') then raise exception 'verification:invalid_state'; end if;
    if v_note is null then raise exception 'verification:note_required'; end if;
    update public.verification_cases
       set status = 'rejected', decision_reason = left(v_note, 1000), reviewed_by = p_actor, reviewed_at = now(), updated_at = now()
     where id = c.id;
    update public.profiles set account_status = 'rejected'
     where id = c.profile_id and account_status = 'pending_verification';
    insert into public.verification_events (case_id, actor_id, event) values (c.id, p_actor, 'rejected');
    return 'rejected';
  end if;

  raise exception 'verification:invalid_input';
end;
$$;
revoke all on function public.verification_transition(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.verification_transition(uuid, uuid, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.verification_cases enable row level security;
alter table public.verification_documents enable row level security;
alter table public.verification_events enable row level security;

revoke all on public.verification_cases, public.verification_documents, public.verification_events from anon, authenticated;
grant select on public.verification_cases, public.verification_documents, public.verification_events to authenticated;
grant select, insert, update on public.verification_cases, public.verification_documents to service_role;
revoke all on public.verification_events from service_role;
grant select, insert on public.verification_events to service_role;

drop policy if exists verification_cases_select on public.verification_cases;
create policy verification_cases_select on public.verification_cases for select to authenticated
  using (profile_id = (select auth.uid()) or private.is_admin());

drop policy if exists verification_documents_select on public.verification_documents;
create policy verification_documents_select on public.verification_documents for select to authenticated
  using (exists (select 1 from public.verification_cases c where c.id = case_id
                 and (c.profile_id = (select auth.uid()) or private.is_admin())));

drop policy if exists verification_events_select on public.verification_events;
create policy verification_events_select on public.verification_events for select to authenticated
  using (exists (select 1 from public.verification_cases c where c.id = case_id
                 and (c.profile_id = (select auth.uid()) or private.is_admin())));

-- Private bucket. No storage.objects policies: only the service role reads or
-- writes, and admins view through ≤5-minute signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification-docs', 'verification-docs', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.verification_cases is
  'KYC/KYB/representative verification cases (0032). Server-written; transitions via verification_transition(). Approval is a manual document review, never a biometric identity check.';

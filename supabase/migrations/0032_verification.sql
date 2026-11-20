-- ===========================================================================
-- 0032: Verification before an account exists (creator KYC, company KYB,
-- representative authorization) and one-time account activation
-- ===========================================================================
--
-- Specs: docs/CREATOR_KYC_SPEC.md, docs/COMPANY_KYB_SPEC.md,
--        docs/COMPANY_REPRESENTATIVES_PERMISSIONS.md,
--        docs/ACCOUNT_ACTIVATION_FLOW.md
--
-- SEQUENCE (owner requirement, 2026-11-02)
--   Get Started → application (access_requests, 0024) + verification case
--   → manual review → approval email with a one-time activation link
--   → the applicant sets a password → the account is created and linked.
--   No auth user and no profile exist before approval.
--
-- WHAT
--   * profiles.account_status: 'active' (default; every existing account is
--     unchanged), 'pending_verification', 'rejected'. Server-written only.
--     New applicants never hold a pending account any more. The column stays
--     for an already-active account that opens a verification case later.
--   * verification_cases: one case per applicant and kind. It belongs EITHER
--     to an application (access_request_id, before an account exists) OR to
--     an existing profile (profile_id). On activation, profile_id is filled
--     in. State machine:
--       draft → submitted → under_review → approved | rejected
--                      ↘ needs_info → submitted (resubmission)
--   * verification_documents: metadata of files in the private bucket
--     'verification-docs'. capture_method records how the client said it
--     captured the file ('camera' for creator identity images). The server
--     cannot prove the capture source; see docs/CREATOR_KYC_SPEC.md.
--   * verification_events: append-only history.
--   * verification_reviewers: admins allowed to review cases and view
--     identity documents. Empty by default, so nobody can review until the
--     owner grants it (fail closed). Granting is a service-role write.
--   * application_tokens: hashes of one-time tokens (purpose 'resume' to
--     continue an application, 'activation' to create the account). The raw
--     token is shown once, in the email; only its SHA-256 is stored.
--
-- WHAT IT DOES NOT CLAIM
--   Approval records method 'manual_document_review'. No face match, no
--   liveness check and no biometric processing exists. 'provider' is
--   reserved and requires a provider reference.
--
-- WHO
--   * anon: nothing.
--   * authenticated: SELECT of their own profile-owned cases, documents and
--     events; reviewers read all. No client writes.
--   * service_role: drafts and documents (after validation in the server)
--     and every transition and token operation through the functions below,
--     which re-check state in the same transaction.
--
-- PREREQUISITES 0001, 0004 (private.is_admin), 0024 (access_requests,
-- company_members). IDEMPOTENT.
--
-- ROLLBACK (deletes all verification data; files must be removed from the
-- bucket separately; ask first):
--   drop function if exists public.activation_complete(text, uuid, text),
--     public.activation_release(text), public.activation_checkpoint(text, uuid),
--     public.activation_claim(text), public.application_token_lookup(text, text),
--     public.application_token_issue(uuid, text, text, integer, uuid),
--     public.verification_transition(uuid, uuid, text, text, uuid),
--     private.is_verification_reviewer(uuid);
--   drop table if exists public.application_tokens, public.verification_reviewers,
--     public.verification_events, public.verification_documents, public.verification_cases;
--   alter table public.profiles drop column if exists account_status;
--   delete from storage.buckets where id = 'verification-docs';
-- ===========================================================================

alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status in ('pending_verification', 'active', 'rejected'));
comment on column public.profiles.account_status is
  'active (default) | pending_verification | rejected. Server-written only (0032).';

-- ---------------------------------------------------------------------------
-- Cases
-- ---------------------------------------------------------------------------
create table if not exists public.verification_cases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete cascade,
  access_request_id uuid references public.access_requests (id) on delete cascade,
  kind text not null check (kind in ('creator_kyc', 'company_kyb', 'representative')),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'under_review', 'needs_info', 'approved', 'rejected')),
  -- Validated form fields. Never documents; no personal ID number is collected.
  details jsonb not null default '{}'::jsonb,
  -- Representative cases: the company account they represent (set by a reviewer).
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
  constraint verification_rep_not_self check (company_profile_id is null or company_profile_id is distinct from profile_id),
  constraint verification_case_owner check (profile_id is not null or access_request_id is not null)
);
create unique index if not exists verification_cases_one_per_kind
  on public.verification_cases (profile_id, kind) where profile_id is not null;
create unique index if not exists verification_cases_one_per_application
  on public.verification_cases (access_request_id, kind) where access_request_id is not null;
create index if not exists verification_cases_queue_idx on public.verification_cases (status, submitted_at);

create table if not exists public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.verification_cases (id) on delete cascade,
  doc_type text not null check (doc_type in (
    'selfie', 'id_front', 'id_back', 'passport', 'commercial_register', 'tax_card', 'authorization_letter', 'other')),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  capture_method text not null default 'upload' check (capture_method in ('camera', 'upload')),
  uploaded_at timestamptz not null default now(),
  removed_at timestamptz,
  -- Camera images: the identity images of a creator must come from the in-page camera.
  constraint verification_identity_images_are_camera check (
    doc_type not in ('selfie', 'id_front', 'id_back') or (capture_method = 'camera' and mime = 'image/jpeg'))
);
create index if not exists verification_documents_case_idx on public.verification_documents (case_id) where removed_at is null;

create table if not exists public.verification_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.verification_cases (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  event text not null check (event in (
    'created', 'submitted', 'review_started', 'info_requested', 'approved', 'rejected',
    'document_added', 'document_removed', 'document_viewed', 'document_purged',
    'activation_issued', 'account_activated')),
  -- Ids and codes only, never document contents or personal details.
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists verification_events_case_idx on public.verification_events (case_id, id);

-- ---------------------------------------------------------------------------
-- Reviewers (fail closed: empty until the owner grants someone)
-- ---------------------------------------------------------------------------
create table if not exists public.verification_reviewers (
  admin_id uuid primary key references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now()
);

create or replace function private.is_verification_reviewer(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.verification_reviewers r
      join public.profiles p on p.id = r.admin_id
     where r.admin_id = p_uid and p.role = 'admin' and p.banned_at is null)
$$;
revoke all on function private.is_verification_reviewer(uuid) from public, anon;
grant execute on function private.is_verification_reviewer(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- One-time tokens (only hashes stored)
-- ---------------------------------------------------------------------------
create table if not exists public.application_tokens (
  id uuid primary key default gen_random_uuid(),
  access_request_id uuid not null references public.access_requests (id) on delete cascade,
  purpose text not null check (purpose in ('resume', 'activation')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  -- Activation progress, so a crash between steps is recoverable.
  claimed_at timestamptz,
  claimed_user_id uuid,
  completed_at timestamptz,
  attempts integer not null default 0
);
create index if not exists application_tokens_request_idx on public.application_tokens (access_request_id, purpose);

-- ---------------------------------------------------------------------------
-- Transitions. service_role only; raises 'verification:<code>'.
--   * submit: by the subject. For an application (no profile yet) p_actor is
--     NULL and the server has already checked the applicant's resume token.
--   * everything else: by a verification reviewer who is not the subject.
-- ---------------------------------------------------------------------------
drop function if exists public.verification_transition(uuid, uuid, text, text, uuid);
create function public.verification_transition(
  p_actor uuid, p_case uuid, p_action text, p_note text default null, p_company uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.verification_cases%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_docs text[];
begin
  select * into c from public.verification_cases where id = p_case for update;
  if not found then raise exception 'verification:not_found'; end if;

  if p_action = 'submit' then
    if c.profile_id is null then
      if p_actor is not null then raise exception 'verification:not_found'; end if;
    elsif p_actor is distinct from c.profile_id then
      raise exception 'verification:not_found';
    end if;
    if c.status not in ('draft', 'needs_info') then raise exception 'verification:invalid_state'; end if;
    select coalesce(array_agg(doc_type), '{}') into v_docs
      from public.verification_documents where case_id = c.id and removed_at is null;
    if c.kind = 'creator_kyc' and not (v_docs @> array['selfie', 'id_front', 'id_back']) then
      raise exception 'verification:documents_missing';
    end if;
    if c.kind = 'company_kyb' and not (v_docs @> array['commercial_register', 'tax_card', 'authorization_letter']) then
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

  if p_actor is null or not private.is_verification_reviewer(p_actor) or p_actor is not distinct from c.profile_id then
    raise exception 'verification:not_allowed';
  end if;

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
      if p_company is not distinct from c.profile_id then raise exception 'verification:company_required'; end if;
    end if;
    update public.verification_cases
       set status = 'approved', method = 'manual_document_review', decision_reason = left(v_note, 1000),
           company_profile_id = coalesce(p_company, company_profile_id),
           reviewed_by = p_actor, reviewed_at = now(), updated_at = now()
     where id = c.id;
    if c.profile_id is not null then
      update public.profiles set account_status = 'active'
       where id = c.profile_id and account_status = 'pending_verification';
      if c.kind = 'representative' then
        insert into public.company_members (member_id, company_id, member_role, created_by)
        values (c.profile_id, p_company, 'representative', p_actor)
        on conflict (member_id) do update set company_id = excluded.company_id, created_by = excluded.created_by
          where public.company_members.member_role = 'representative';
      end if;
    end if;
    -- An application's account is created only by activation_complete().
    insert into public.verification_events (case_id, actor_id, event, detail)
    values (c.id, p_actor, 'approved', jsonb_build_object('method', 'manual_document_review'));
    return 'approved';

  elsif p_action = 'reject' then
    if c.status not in ('submitted', 'under_review', 'needs_info') then raise exception 'verification:invalid_state'; end if;
    if v_note is null then raise exception 'verification:note_required'; end if;
    update public.verification_cases
       set status = 'rejected', decision_reason = left(v_note, 1000), reviewed_by = p_actor, reviewed_at = now(), updated_at = now()
     where id = c.id;
    if c.profile_id is not null then
      update public.profiles set account_status = 'rejected'
       where id = c.profile_id and account_status = 'pending_verification';
    end if;
    if c.access_request_id is not null then
      update public.access_requests set status = 'rejected', reviewed_by = p_actor, reviewed_at = now()
       where id = c.access_request_id and status = 'pending';
      update public.application_tokens set revoked_at = now()
       where access_request_id = c.access_request_id and revoked_at is null and completed_at is null;
    end if;
    insert into public.verification_events (case_id, actor_id, event) values (c.id, p_actor, 'rejected');
    return 'rejected';
  end if;

  raise exception 'verification:invalid_input';
end;
$$;
revoke all on function public.verification_transition(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.verification_transition(uuid, uuid, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Tokens. Raise 'activation:<code>'.
-- ---------------------------------------------------------------------------
create or replace function public.application_token_issue(
  p_request uuid, p_purpose text, p_hash text, p_ttl_seconds integer, p_actor uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.access_requests%rowtype;
  v_id uuid;
begin
  if p_purpose not in ('resume', 'activation') then raise exception 'activation:invalid_input'; end if;
  if p_ttl_seconds is null or p_ttl_seconds < 300 or p_ttl_seconds > 30 * 86400 then raise exception 'activation:invalid_input'; end if;
  select * into r from public.access_requests where id = p_request for update;
  if not found then raise exception 'activation:not_found'; end if;
  if r.created_profile_id is not null then raise exception 'activation:already_activated'; end if;

  if p_purpose = 'activation' then
    if p_actor is null or not private.is_verification_reviewer(p_actor) then raise exception 'activation:not_allowed'; end if;
    if not exists (select 1 from public.verification_cases where access_request_id = r.id and status = 'approved')
       or exists (select 1 from public.verification_cases where access_request_id = r.id and status <> 'approved') then
      raise exception 'activation:not_approved';
    end if;
    -- A new link replaces every earlier one.
    update public.application_tokens set revoked_at = now()
     where access_request_id = r.id and purpose = 'activation' and revoked_at is null and completed_at is null;
  else
    if r.status <> 'pending' then raise exception 'activation:not_found'; end if;
    -- At most five live resume links per application.
    update public.application_tokens set revoked_at = now()
     where id in (select id from public.application_tokens
                   where access_request_id = r.id and purpose = 'resume' and revoked_at is null and expires_at > now()
                   order by created_at desc offset 4);
  end if;

  insert into public.application_tokens (access_request_id, purpose, token_hash, expires_at, created_by)
  values (r.id, p_purpose, p_hash, now() + make_interval(secs => p_ttl_seconds), p_actor)
  returning id into v_id;
  if p_purpose = 'activation' then
    insert into public.verification_events (case_id, actor_id, event)
    select id, p_actor, 'activation_issued' from public.verification_cases where access_request_id = r.id;
  end if;
  return v_id;
end;
$$;

-- Read-only: what a token is good for. Unknown hashes return no row.
create or replace function public.application_token_lookup(p_hash text, p_purpose text)
returns table (access_request_id uuid, state text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select t.access_request_id,
         case
           when t.completed_at is not null then 'used'
           when t.revoked_at is not null then 'revoked'
           when t.expires_at <= now() then 'expired'
           when r.created_profile_id is not null then 'used'
           when t.purpose = 'resume' and r.status <> 'pending' then 'revoked'
           else 'valid'
         end,
         t.expires_at
    from public.application_tokens t
    join public.access_requests r on r.id = t.access_request_id
   where t.token_hash = p_hash and t.purpose = p_purpose
$$;

-- Step 1 of activation: lock the token. Only one caller at a time; a claim
-- older than two minutes that never completed may be taken over (crash
-- recovery). Returns what the server needs to create the auth user.
create or replace function public.activation_claim(p_hash text)
returns table (access_request_id uuid, email text, full_name text, journey text,
               company_name text, website text, claimed_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  t public.application_tokens%rowtype;
  r public.access_requests%rowtype;
begin
  select * into t from public.application_tokens where token_hash = p_hash and purpose = 'activation' for update;
  if not found then raise exception 'activation:not_found'; end if;
  if t.completed_at is not null then raise exception 'activation:used'; end if;
  if t.revoked_at is not null then raise exception 'activation:revoked'; end if;
  if t.expires_at <= now() then raise exception 'activation:expired'; end if;
  if t.attempts >= 10 then raise exception 'activation:locked'; end if;
  if t.claimed_at is not null and t.claimed_at > now() - interval '2 minutes' then
    raise exception 'activation:in_progress';
  end if;
  select * into r from public.access_requests where id = t.access_request_id for update;
  if r.created_profile_id is not null then raise exception 'activation:used'; end if;
  if not exists (select 1 from public.verification_cases where access_request_id = r.id and status = 'approved')
     or exists (select 1 from public.verification_cases where access_request_id = r.id and status <> 'approved') then
    raise exception 'activation:not_approved';
  end if;
  update public.application_tokens set claimed_at = now(), attempts = attempts + 1 where id = t.id;
  return query select r.id, lower(r.email), r.full_name, r.journey, r.company_name, r.website, t.claimed_user_id;
end;
$$;

-- Step 2: remember the auth user just created, before anything else can fail.
create or replace function public.activation_checkpoint(p_hash text, p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.application_tokens set claimed_user_id = p_user
   where token_hash = p_hash and purpose = 'activation' and completed_at is null and claimed_at is not null
$$;

-- Undo a claim when no auth user was created, so the person can try again.
create or replace function public.activation_release(p_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.application_tokens set claimed_at = null
   where token_hash = p_hash and purpose = 'activation' and completed_at is null and claimed_user_id is null
$$;

-- Step 3, atomic: profile, case links, application status, representative
-- link, history, and the token marked used. Either all of it or none.
create or replace function public.activation_complete(p_hash text, p_user uuid, p_alias text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.application_tokens%rowtype;
  r public.access_requests%rowtype;
  v_role text;
  v_rep public.verification_cases%rowtype;
begin
  select * into t from public.application_tokens where token_hash = p_hash and purpose = 'activation' for update;
  if not found then raise exception 'activation:not_found'; end if;
  if t.completed_at is not null then raise exception 'activation:used'; end if;
  if t.revoked_at is not null or t.claimed_at is null or t.claimed_user_id is distinct from p_user then
    raise exception 'activation:not_claimed';
  end if;
  select * into r from public.access_requests where id = t.access_request_id for update;
  if r.created_profile_id is not null then raise exception 'activation:used'; end if;
  if exists (select 1 from public.verification_cases where access_request_id = r.id and status <> 'approved') then
    raise exception 'activation:not_approved';
  end if;
  v_role := case when r.journey = 'creator' then 'creator' else 'company' end;

  insert into public.profiles (id, full_name, role, primary_email, inbound_alias, must_change_password,
                               account_status, company_website)
  values (p_user, r.full_name, v_role, lower(r.email),
          case when v_role = 'creator' then p_alias else null end, false, 'active',
          case when v_role = 'company' and r.journey = 'company' then r.website else null end);

  update public.verification_cases set profile_id = p_user, updated_at = now() where access_request_id = r.id;
  update public.access_requests set status = 'approved', created_profile_id = p_user, reviewed_at = coalesce(reviewed_at, now())
   where id = r.id;

  select * into v_rep from public.verification_cases where access_request_id = r.id and kind = 'representative';
  if found and v_rep.company_profile_id is not null then
    insert into public.company_members (member_id, company_id, member_role, created_by)
    values (p_user, v_rep.company_profile_id, 'representative', v_rep.reviewed_by)
    on conflict (member_id) do nothing;
  end if;

  insert into public.verification_events (case_id, actor_id, event)
  select id, p_user, 'account_activated' from public.verification_cases where access_request_id = r.id;
  update public.application_tokens set completed_at = now() where id = t.id;
  update public.application_tokens set revoked_at = now()
   where access_request_id = r.id and id <> t.id and revoked_at is null and completed_at is null;
  return p_user;
end;
$$;

revoke all on function public.application_token_issue(uuid, text, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.application_token_lookup(text, text) from public, anon, authenticated;
revoke all on function public.activation_claim(text) from public, anon, authenticated;
revoke all on function public.activation_checkpoint(text, uuid) from public, anon, authenticated;
revoke all on function public.activation_release(text) from public, anon, authenticated;
revoke all on function public.activation_complete(text, uuid, text) from public, anon, authenticated;
grant execute on function public.application_token_issue(uuid, text, text, integer, uuid) to service_role;
grant execute on function public.application_token_lookup(text, text) to service_role;
grant execute on function public.activation_claim(text) to service_role;
grant execute on function public.activation_checkpoint(text, uuid) to service_role;
grant execute on function public.activation_release(text) to service_role;
grant execute on function public.activation_complete(text, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.verification_cases enable row level security;
alter table public.verification_documents enable row level security;
alter table public.verification_events enable row level security;
alter table public.verification_reviewers enable row level security;
alter table public.application_tokens enable row level security;

revoke all on public.verification_cases, public.verification_documents, public.verification_events,
  public.verification_reviewers, public.application_tokens from anon, authenticated;
grant select on public.verification_cases, public.verification_documents, public.verification_events to authenticated;
grant select, insert, update on public.verification_cases, public.verification_documents to service_role;
revoke all on public.verification_events from service_role;
grant select, insert on public.verification_events to service_role;
revoke all on public.verification_reviewers from service_role;
grant select, insert, delete on public.verification_reviewers to service_role;
revoke all on public.application_tokens from service_role;
grant select on public.application_tokens to service_role;

drop policy if exists verification_cases_select on public.verification_cases;
create policy verification_cases_select on public.verification_cases for select to authenticated
  using ((profile_id is not null and profile_id = (select auth.uid())) or private.is_verification_reviewer((select auth.uid())));

drop policy if exists verification_documents_select on public.verification_documents;
create policy verification_documents_select on public.verification_documents for select to authenticated
  using (exists (select 1 from public.verification_cases c where c.id = case_id
                 and ((c.profile_id is not null and c.profile_id = (select auth.uid()))
                      or private.is_verification_reviewer((select auth.uid())))));

drop policy if exists verification_events_select on public.verification_events;
create policy verification_events_select on public.verification_events for select to authenticated
  using (exists (select 1 from public.verification_cases c where c.id = case_id
                 and ((c.profile_id is not null and c.profile_id = (select auth.uid()))
                      or private.is_verification_reviewer((select auth.uid())))));

-- Private bucket. No storage.objects policies: only the service role reads or
-- writes, and reviewers view through ≤5-minute signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification-docs', 'verification-docs', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.verification_cases is
  'KYC/KYB/representative verification cases (0032). Belong to an application before an account exists. Approval is a manual document review, never a biometric identity check.';
comment on table public.application_tokens is
  'SHA-256 hashes of one-time resume and activation tokens (0032). Raw tokens exist only in the email the applicant receives.';

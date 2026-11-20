-- ===========================================================================
-- 0040: Internal reviewer notes, enhanced fraud review, reapplication after
--       rejection, and the 12-month document retention guard
-- ===========================================================================
--
-- WHY (owner decisions of 2026-11-19, docs/REGISTRATION_ONBOARDING_FLOW.md)
--   1. Reviewer notes. Until now every reviewer note reached the applicant
--      (verification_cases.info_request / decision_reason, which the
--      applicant reads through RLS). Reviewers need notes the applicant can
--      never read. RLS gates rows, not columns, so these cannot be columns on
--      verification_cases: they live in their own reviewer-only table.
--   2. Suspected fraud, identity forgery or impersonation must route a case,
--      and any later application from the same person, to enhanced review.
--      Nothing is decided automatically: a flag only adds a requirement to
--      approval (a written internal justification by the approving reviewer).
--   3. A rejected ACCOUNT could never apply again (one case per kind). It may
--      now open a new case; the account returns to pending_verification and
--      becomes active again only through a reviewer's approval of that case.
--   4. Identity-document retention is 12 months (365 days). The database now
--      refuses to mark a document purged before that, whoever asks.
--
-- WHAT
--   verification_notes   append-only internal notes; SELECT for reviewers only
--                        (never the case's own subject); written only through
--                        verification_add_note().
--   verification_flags   append-only fraud/forgery/impersonation flags, keyed
--                        to the case and the subject's email; SELECT for
--                        reviewers only; written only through verification_flag().
--   Neither writes a verification_events row: the applicant can read events,
--   and the existence of an internal note or flag must not leak to them.
--   private.verification_submit_guard() keeps 0039's submission rules and adds
--   the enhanced-review rule on approval.
--   verification_cases_one_per_kind ignores rejected cases;
--   verification_reapply() opens the new case.
--   verification_documents.purged_at / purge_confirmed_at, a trigger that
--   enforces the 365-day rule on purged_at, verification_purge_mark() /
--   _confirm() / _failed(), and the 'document_purge_failed' event.
--
-- WHO: every function is SECURITY DEFINER, executable by service_role only,
--   and re-checks the reviewer allowlist itself. No new grant to anon;
--   authenticated gets SELECT on the two new tables under reviewer-only RLS.
--
-- SIZE / LOCKING: two new empty tables, two nullable columns, one index
--   rebuilt (verification_cases is small), one CHECK replaced, triggers and
--   functions.
--
-- IDEMPOTENT.
-- ROLLBACK (in this order):
--   drop trigger if exists verification_documents_purge_guard on public.verification_documents;
--   drop function if exists private.verification_documents_purge_guard();
--   drop function if exists public.verification_purge_mark(uuid), public.verification_purge_confirm(uuid),
--     public.verification_purge_failed(uuid, text), public.verification_reapply(uuid, text),
--     public.verification_add_note(uuid, uuid, text), public.verification_flag(uuid, uuid, text, text),
--     private.verification_purge_due(uuid), private.verification_subject_email(uuid);
--   re-run 0039's private.verification_submit_guard();
--   alter table public.verification_documents drop column if exists purge_confirmed_at, drop column if exists purged_at;
--   drop index verification_cases_one_per_kind; recreate it as in 0032 (fails if a profile reapplied);
--   drop table if exists public.verification_flags, public.verification_notes;
--   restore 0039's verification_events_event_check.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Internal reviewer notes
-- ---------------------------------------------------------------------------
create table if not exists public.verification_notes (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.verification_cases (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  -- 'note': a reviewer's note. 'flag_reason': the explanation written with a flag
  -- (never counts as the justification for approving a flagged case).
  kind text not null default 'note' check (kind in ('note', 'flag_reason')),
  -- clock_timestamp(), not now(): ordering against a flag must be exact even inside one transaction.
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists verification_notes_case_idx on public.verification_notes (case_id, id);
comment on table public.verification_notes is
  'Internal reviewer notes (0040). Readable by verification reviewers only, never by the subject of the case; append-only; written through verification_add_note().';

-- ---------------------------------------------------------------------------
-- 2. Enhanced-review flags
-- ---------------------------------------------------------------------------
create table if not exists public.verification_flags (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.verification_cases (id) on delete cascade,
  subject_email text not null check (subject_email = lower(subject_email) and char_length(subject_email) between 3 and 254),
  reason text not null check (reason in ('suspected_fraud', 'identity_forgery', 'impersonation')),
  raised_by uuid references public.profiles (id) on delete set null,
  raised_at timestamptz not null default clock_timestamp()
);
create index if not exists verification_flags_case_idx on public.verification_flags (case_id);
create index if not exists verification_flags_email_idx on public.verification_flags (subject_email);
comment on table public.verification_flags is
  'Enhanced-review flags (0040): suspected fraud, identity forgery or impersonation. A flag decides nothing; approving a flagged case, or a later case from the same email, needs an internal justification note. Reviewers only.';

alter table public.verification_notes enable row level security;
alter table public.verification_flags enable row level security;
revoke all on public.verification_notes, public.verification_flags from anon, authenticated, service_role;
grant select on public.verification_notes, public.verification_flags to authenticated;
grant select on public.verification_notes, public.verification_flags to service_role;

-- The subject of a case may never read notes or flags about it, even if they are a reviewer.
drop policy if exists verification_notes_select on public.verification_notes;
create policy verification_notes_select on public.verification_notes for select to authenticated
  using (private.is_verification_reviewer((select auth.uid()))
         and not exists (select 1 from public.verification_cases c where c.id = case_id and c.profile_id = (select auth.uid())));
drop policy if exists verification_flags_select on public.verification_flags;
create policy verification_flags_select on public.verification_flags for select to authenticated
  using (private.is_verification_reviewer((select auth.uid()))
         and not exists (select 1 from public.verification_cases c where c.id = case_id and c.profile_id = (select auth.uid())));

-- The email that identifies the subject of a case: the application's, else the account's.
create or replace function private.verification_subject_email(p_case uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(coalesce(
    (select r.email from public.verification_cases c join public.access_requests r on r.id = c.access_request_id where c.id = p_case),
    (select p.primary_email from public.verification_cases c join public.profiles p on p.id = c.profile_id where c.id = p_case)))
$$;
revoke all on function private.verification_subject_email(uuid) from public, anon, authenticated;

create or replace function public.verification_add_note(p_actor uuid, p_case uuid, p_body text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.verification_cases%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_id bigint;
begin
  select * into c from public.verification_cases where id = p_case;
  if not found then raise exception 'verification:not_found'; end if;
  if p_actor is null or not private.is_verification_reviewer(p_actor) or p_actor is not distinct from c.profile_id then
    raise exception 'verification:not_allowed';
  end if;
  if v_body = '' then raise exception 'verification:note_required'; end if;
  insert into public.verification_notes (case_id, author_id, body) values (c.id, p_actor, left(v_body, 2000)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.verification_flag(p_actor uuid, p_case uuid, p_reason text, p_note text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.verification_cases%rowtype;
  v_email text;
  v_note text := btrim(coalesce(p_note, ''));
  v_id bigint;
begin
  select * into c from public.verification_cases where id = p_case for update;
  if not found then raise exception 'verification:not_found'; end if;
  if p_actor is null or not private.is_verification_reviewer(p_actor) or p_actor is not distinct from c.profile_id then
    raise exception 'verification:not_allowed';
  end if;
  if p_reason is null or p_reason not in ('suspected_fraud', 'identity_forgery', 'impersonation') then
    raise exception 'verification:invalid_input';
  end if;
  -- A flag is always explained, in an internal note.
  if v_note = '' then raise exception 'verification:note_required'; end if;
  v_email := private.verification_subject_email(c.id);
  if v_email is null then raise exception 'verification:not_found'; end if;
  insert into public.verification_flags (case_id, subject_email, reason, raised_by) values (c.id, v_email, p_reason, p_actor) returning id into v_id;
  insert into public.verification_notes (case_id, author_id, body, kind)
  values (c.id, p_actor, left('[' || p_reason || '] ' || v_note, 2000), 'flag_reason');
  return v_id;
end;
$$;

revoke all on function public.verification_add_note(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.verification_flag(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.verification_add_note(uuid, uuid, text) to service_role;
grant execute on function public.verification_flag(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Guard: 0039's submission rules, plus enhanced review on approval
-- ---------------------------------------------------------------------------
create or replace function private.verification_submit_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_docs text[];
  v_email text;
  v_flagged_at timestamptz;
begin
  if new.status = 'submitted' and old.status <> 'submitted' then
    if new.access_request_id is not null and not exists (
        select 1 from public.access_requests
         where id = new.access_request_id and email_verified_at is not null) then
      raise exception 'verification:email_unverified';
    end if;
    select coalesce(array_agg(doc_type), '{}') into v_docs
      from public.verification_documents where case_id = new.id and removed_at is null;
    if new.kind = 'representative' and not (v_docs @> array['selfie', 'id_front', 'id_back']) then
      raise exception 'verification:documents_missing';
    end if;
    if new.kind = 'creator_kyc' and new.access_request_id is not null and not (v_docs @> array['profile_photo']) then
      raise exception 'verification:documents_missing';
    end if;
  end if;

  -- 0040: a flagged case, or any case of a flagged subject (same email), is
  -- approved only with an internal justification note written by the
  -- approving reviewer after the most recent flag.
  if new.status = 'approved' and old.status <> 'approved' then
    v_email := private.verification_subject_email(new.id);
    select max(raised_at) into v_flagged_at from public.verification_flags
     where case_id = new.id or (v_email is not null and subject_email = v_email);
    if v_flagged_at is not null and not exists (
        select 1 from public.verification_notes n
         where n.case_id = new.id and n.author_id = new.reviewed_by and n.kind = 'note' and n.created_at > v_flagged_at) then
      raise exception 'verification:enhanced_review_note_required';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.verification_submit_guard() from public, anon, authenticated;
drop trigger if exists verification_submit_guard on public.verification_cases;
create trigger verification_submit_guard
  before update of status on public.verification_cases
  for each row execute function private.verification_submit_guard();

-- ---------------------------------------------------------------------------
-- 4. Reapplication after rejection (accounts)
-- ---------------------------------------------------------------------------
drop index if exists public.verification_cases_one_per_kind;
create unique index verification_cases_one_per_kind
  on public.verification_cases (profile_id, kind) where profile_id is not null and status <> 'rejected';

create or replace function public.verification_reapply(p_profile uuid, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles%rowtype;
  v_prev uuid;
  v_id uuid;
begin
  select * into p from public.profiles where id = p_profile for update;
  if not found then raise exception 'verification:not_found'; end if;
  -- Only a rejected account reapplies this way; it is never reactivated here.
  if p.account_status is distinct from 'rejected' then raise exception 'verification:invalid_state'; end if;
  if not ((p.role = 'creator' and p_kind = 'creator_kyc') or (p.role = 'company' and p_kind in ('company_kyb', 'representative'))) then
    raise exception 'verification:not_allowed';
  end if;
  if exists (select 1 from public.verification_cases where profile_id = p.id and status <> 'rejected') then
    raise exception 'verification:invalid_state';
  end if;
  select id into v_prev from public.verification_cases where profile_id = p.id order by created_at desc limit 1;
  if v_prev is null then raise exception 'verification:invalid_state'; end if;
  insert into public.verification_cases (profile_id, kind) values (p.id, p_kind) returning id into v_id;
  update public.profiles set account_status = 'pending_verification' where id = p.id;
  insert into public.verification_events (case_id, actor_id, event, detail)
  values (v_id, p.id, 'created', jsonb_build_object('reapplication', true, 'previous_case', v_prev));
  return v_id;
end;
$$;
revoke all on function public.verification_reapply(uuid, text) from public, anon, authenticated;
grant execute on function public.verification_reapply(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Retention: 365 days, enforced by the database
-- ---------------------------------------------------------------------------
alter table public.verification_documents add column if not exists purged_at timestamptz;
alter table public.verification_documents add column if not exists purge_confirmed_at timestamptz;
create index if not exists verification_documents_purge_pending_idx
  on public.verification_documents (purged_at) where purged_at is not null and purge_confirmed_at is null;

alter table public.verification_events drop constraint if exists verification_events_event_check;
alter table public.verification_events add constraint verification_events_event_check check (event in (
  'created', 'submitted', 'review_started', 'info_requested', 'approved', 'rejected',
  'document_added', 'document_removed', 'document_viewed', 'document_purged',
  'activation_issued', 'account_activated', 'email_verified', 'document_purge_failed'));

-- The one predicate: a case's files are due when it was decided (approved or
-- rejected) more than 365 days ago, or abandoned in draft for 365 days. Cases
-- awaiting review or information are never due.
create or replace function private.verification_purge_due(p_case uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
             when c.status in ('approved', 'rejected') then c.reviewed_at is not null and c.reviewed_at <= now() - interval '365 days'
             when c.status = 'draft' then c.updated_at <= now() - interval '365 days'
             else false
           end
      from public.verification_cases c where c.id = p_case), false)
$$;
revoke all on function private.verification_purge_due(uuid) from public, anon, authenticated;

-- Whoever updates a row (the purge function or any service-role code), a
-- document is marked purged only when it is due, and never un-purged.
create or replace function private.verification_documents_purge_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.purged_at is not null and new.purged_at is distinct from old.purged_at then
    raise exception 'retention:immutable';
  end if;
  if new.purged_at is not null and old.purged_at is null and not private.verification_purge_due(new.case_id) then
    raise exception 'retention:not_due';
  end if;
  if new.purge_confirmed_at is not null and new.purged_at is null then
    raise exception 'retention:not_marked';
  end if;
  return new;
end;
$$;
revoke all on function private.verification_documents_purge_guard() from public, anon, authenticated;
drop trigger if exists verification_documents_purge_guard on public.verification_documents;
create trigger verification_documents_purge_guard
  before update on public.verification_documents
  for each row execute function private.verification_documents_purge_guard();

-- Step 1: mark a due document purged (it disappears from every view) and
-- return its object name, so the caller deletes exactly that file.
create or replace function public.verification_purge_mark(p_doc uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.verification_documents%rowtype;
begin
  select * into d from public.verification_documents where id = p_doc for update;
  if not found then raise exception 'retention:not_found'; end if;
  if d.purged_at is not null then return d.storage_path; end if;  -- a retry
  if d.removed_at is not null then raise exception 'retention:not_found'; end if;
  perform 1 from public.verification_cases where id = d.case_id for update;
  if not private.verification_purge_due(d.case_id) then raise exception 'retention:not_due'; end if;
  update public.verification_documents set removed_at = now(), purged_at = now() where id = d.id;
  insert into public.verification_events (case_id, actor_id, event, detail)
  values (d.case_id, null, 'document_purged', jsonb_build_object('doc_type', d.doc_type, 'retention_days', 365));
  return d.storage_path;
end;
$$;

-- Step 2: the stored file is gone.
create or replace function public.verification_purge_confirm(p_doc uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.verification_documents set purge_confirmed_at = now()
   where id = p_doc and purged_at is not null and purge_confirmed_at is null
$$;

-- A failed deletion is recorded (no contents), and the next run retries it.
create or replace function public.verification_purge_failed(p_doc uuid, p_code text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.verification_events (case_id, actor_id, event, detail)
  select d.case_id, null, 'document_purge_failed', jsonb_build_object('doc_type', d.doc_type, 'code', left(coalesce(p_code, 'unknown'), 40))
    from public.verification_documents d where d.id = p_doc and d.purged_at is not null and d.purge_confirmed_at is null
$$;

revoke all on function public.verification_purge_mark(uuid) from public, anon, authenticated;
revoke all on function public.verification_purge_confirm(uuid) from public, anon, authenticated;
revoke all on function public.verification_purge_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.verification_purge_mark(uuid) to service_role;
grant execute on function public.verification_purge_confirm(uuid) to service_role;
grant execute on function public.verification_purge_failed(uuid, text) to service_role;

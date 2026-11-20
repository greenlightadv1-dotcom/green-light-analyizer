-- ===========================================================================
-- 0041: Second-reviewer approval for fraud-flagged cases, and keyed
--       duplicate-identity fingerprints
-- ===========================================================================
--
-- WHY (owner decisions, docs/REGISTRATION_ONBOARDING_FLOW.md)
--   1. Under 0040 the reviewer who raised a fraud flag could also approve the
--      case. Approval of a flagged case now needs a DIFFERENT reviewer from
--      every reviewer who raised a flag that applies to it, with that second
--      reviewer's own internal justification, enforced in the database.
--   2. Enhanced review followed a person by email only. It now also follows
--      them across emails through strong identity fingerprints (identity
--      document number, legal name + date of birth, company registration or
--      tax number), stored only as keyed HMAC-SHA256 fingerprints computed by
--      the server. Phone numbers are fingerprinted for reviewer warnings only:
--      shared numbers are common, so they never trigger enhanced review.
--
-- WHAT
--   verification_match_keys   (case_id, signal, fingerprint). Service role
--                             only: no client grant, not even SELECT. The
--                             identity document number exists ONLY here, as a
--                             fingerprint; the case keeps a masked hint.
--   verification_flag_approvals  audit of every approval of a flagged case:
--                             which flags applied, who raised them, who
--                             approved, which internal note justified it, when.
--                             Reviewers only (RLS, never the subject); written
--                             only by the guard trigger.
--   private.verification_applicable_flags(case)  the flags that apply to a
--                             case: on the case itself, on any case with the
--                             same subject email, or on any case sharing a
--                             STRONG fingerprint with it. There is no "clear"
--                             for a flag, so every flag is active.
--   private.verification_submit_guard()  0040's rules, plus on approval of a
--                             case with applicable flags:
--                               - the approval must come through
--                                 verification_transition() (which records its
--                                 actor for the transaction), so a direct
--                                 service-role UPDATE naming another reviewer
--                                 is refused ('verification:approval_requires_transition');
--                               - the approver raised none of the applicable
--                                 flags ('verification:second_reviewer_required');
--                               - the approver wrote an internal note after
--                                 the latest applicable flag
--                                 ('verification:enhanced_review_note_required');
--                               - an audit row is written.
--   verification_transition()  0032's body unchanged, plus the actor marker.
--   verification_enhanced_review_state(case)  service-role read used by the
--                             server action to refuse early.
--
-- Cases without applicable flags: approval, rejection and information
-- requests behave exactly as before.
--
-- IDEMPOTENT.
-- ROLLBACK:
--   re-run 0040's private.verification_submit_guard() and 0032's verification_transition();
--   drop function if exists public.verification_enhanced_review_state(uuid), private.verification_applicable_flags(uuid);
--   drop table if exists public.verification_flag_approvals, public.verification_match_keys;
-- ===========================================================================

create table if not exists public.verification_match_keys (
  case_id uuid not null references public.verification_cases (id) on delete cascade,
  signal text not null check (signal in ('id_number', 'name_dob', 'phone', 'registration_number', 'tax_number')),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now(),
  primary key (case_id, signal)
);
create index if not exists verification_match_keys_lookup_idx on public.verification_match_keys (signal, fingerprint);
comment on table public.verification_match_keys is
  'Keyed HMAC-SHA256 fingerprints of normalised identity values (0041), for duplicate-identity warnings and enhanced-review linking. Service role only. Never holds a plaintext value.';
alter table public.verification_match_keys enable row level security;
revoke all on public.verification_match_keys from anon, authenticated, service_role;
grant select, insert, update, delete on public.verification_match_keys to service_role;

create table if not exists public.verification_flag_approvals (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.verification_cases (id) on delete cascade,
  flag_ids bigint[] not null,
  flagged_by uuid[] not null,
  approved_by uuid not null references public.profiles (id) on delete restrict,
  justification_note_id bigint not null references public.verification_notes (id) on delete restrict,
  approved_at timestamptz not null default clock_timestamp()
);
create index if not exists verification_flag_approvals_case_idx on public.verification_flag_approvals (case_id);
comment on table public.verification_flag_approvals is
  'Audit of approvals of fraud-flagged cases (0041): applicable flags, who raised them, the independent approving reviewer and their internal justification. Reviewers only; written only by the approval guard.';
alter table public.verification_flag_approvals enable row level security;
revoke all on public.verification_flag_approvals from anon, authenticated, service_role;
grant select on public.verification_flag_approvals to authenticated, service_role;
drop policy if exists verification_flag_approvals_select on public.verification_flag_approvals;
create policy verification_flag_approvals_select on public.verification_flag_approvals for select to authenticated
  using (private.is_verification_reviewer((select auth.uid()))
         and not exists (select 1 from public.verification_cases c where c.id = case_id and c.profile_id = (select auth.uid())));

-- The flags that apply to a case.
create or replace function private.verification_applicable_flags(p_case uuid)
returns setof public.verification_flags
language sql
stable
security definer
set search_path = ''
as $$
  select f.* from public.verification_flags f
   where f.case_id = p_case
      or f.subject_email = private.verification_subject_email(p_case)
      or f.case_id in (
           select other.case_id
             from public.verification_match_keys mine
             join public.verification_match_keys other
               on other.signal = mine.signal and other.fingerprint = mine.fingerprint and other.case_id <> mine.case_id
            where mine.case_id = p_case
              and mine.signal in ('id_number', 'name_dob', 'registration_number', 'tax_number'))
$$;
revoke all on function private.verification_applicable_flags(uuid) from public, anon, authenticated;

drop function if exists public.verification_enhanced_review_state(uuid);
create function public.verification_enhanced_review_state(p_case uuid)
returns table (flag_count integer, flag_ids bigint[], raised_by uuid[], latest_flag_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer, coalesce(array_agg(id order by id), '{}'),
         coalesce(array_agg(distinct raised_by) filter (where raised_by is not null), '{}'), max(raised_at)
    from private.verification_applicable_flags(p_case)
$$;
revoke all on function public.verification_enhanced_review_state(uuid) from public, anon, authenticated;
grant execute on function public.verification_enhanced_review_state(uuid) to service_role;

create or replace function private.verification_submit_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_docs text[];
  v_flag_ids bigint[];
  v_raisers uuid[];
  v_unattributed boolean;
  v_latest timestamptz;
  v_note bigint;
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

  if new.status = 'approved' and old.status <> 'approved' then
    select coalesce(array_agg(id order by id), '{}'),
           coalesce(array_agg(distinct raised_by) filter (where raised_by is not null), '{}'),
           bool_or(raised_by is null),
           max(raised_at)
      into v_flag_ids, v_raisers, v_unattributed, v_latest
      from private.verification_applicable_flags(new.id);
    if cardinality(v_flag_ids) > 0 then
      -- Only verification_transition() may approve a flagged case: it records
      -- the real actor, so reviewed_by cannot simply be written as someone else.
      if new.reviewed_by is null or coalesce(current_setting('gl.verification_actor', true), '') <> new.reviewed_by::text then
        raise exception 'verification:approval_requires_transition';
      end if;
      -- Independent review: the approver raised none of the applicable flags.
      -- A flag whose raiser's account was deleted (raised_by NULL) cannot be
      -- shown to be independent of anyone, so it blocks no one; it still
      -- needs the justification below.
      if new.reviewed_by = any (v_raisers) then
        raise exception 'verification:second_reviewer_required';
      end if;
      select n.id into v_note from public.verification_notes n
       where n.case_id = new.id and n.author_id = new.reviewed_by and n.kind = 'note' and n.created_at > v_latest
       order by n.id desc limit 1;
      if v_note is null then
        raise exception 'verification:enhanced_review_note_required';
      end if;
      insert into public.verification_flag_approvals (case_id, flag_ids, flagged_by, approved_by, justification_note_id)
      values (new.id, v_flag_ids, v_raisers, new.reviewed_by, v_note);
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
-- verification_transition(): 0032's body, unchanged except the actor marker.
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
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_docs text[];
begin
  -- 0041: the one sanctioned path. The approval guard trusts reviewed_by only
  -- when it equals the actor recorded here, for this transaction.
  perform set_config('gl.verification_actor', coalesce(p_actor::text, ''), true);
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

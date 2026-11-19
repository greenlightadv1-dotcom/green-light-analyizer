-- ===========================================================================
-- 0039: Registration, onboarding and trust verification
-- ===========================================================================
--
-- WHY (docs/REGISTRATION_ONBOARDING_FLOW.md)
--   0032 opened applications before any account exists and proved control of
--   the email address only implicitly: nothing could be continued without
--   opening the emailed link. The product now requires email verification to
--   be explicit, recorded and enforced before submission. It also needs a
--   creator's public profile photo kept apart from their identity images,
--   identity images for company representatives, and a way for a rejected
--   applicant to still see their decision and its reason.
--
-- WHAT
--   1. access_requests.email_verified_at: set by the server the first time
--      the applicant opens a valid emailed link. A new 'email_verified' event
--      records it on the application's cases.
--   2. verification_documents.doc_type gains 'profile_photo': a creator's
--      PUBLIC photo, uploaded (not camera) and never an identity document.
--      It is stored privately like every document until activation copies it
--      into the public avatars bucket. The camera-only rule for selfie and ID
--      images is unchanged and still applies to every kind.
--   3. A BEFORE UPDATE trigger on verification_cases refuses a move to
--      'submitted' when:
--        - the case belongs to an application whose email is not verified
--          ('verification:email_unverified');
--        - a representative case lacks the selfie, ID front or ID back
--          ('verification:documents_missing');
--        - a creator APPLICATION lacks a profile photo (an existing account
--          manages its photo in its profile) ('verification:documents_missing').
--      It runs inside verification_transition('submit'), so the one
--      transition path stays the only path, and it holds against any other
--      service-role update too.
--   4. application_token_issue / application_token_lookup: a resume link may
--      be issued and used for a REJECTED application as well as a pending
--      one, so the applicant can read their decision. Every write path still
--      refuses: the case is not editable (EDITABLE = draft, needs_info), the
--      document routes refuse, and verification_transition refuses submit
--      from 'rejected'. Activation is unchanged.
--
-- WHO: written by the service role only. No new grant to anon or
--   authenticated; RLS on these tables is unchanged.
--
-- SIZE / LOCKING: one nullable column, two CHECK constraints replaced (a
--   validating scan of verification_documents / verification_events, which
--   are small), one trigger, two function bodies replaced.
--
-- IDEMPOTENT.
-- ROLLBACK (in this order):
--   drop trigger if exists verification_submit_guard on public.verification_cases;
--   drop function if exists private.verification_submit_guard();
--   re-run the two function definitions from 0032;
--   delete from public.verification_documents where doc_type = 'profile_photo';
--   delete from public.verification_events where event = 'email_verified';
--   restore the two CHECK constraints from 0032;
--   alter table public.access_requests drop column if exists email_verified_at;
-- ===========================================================================

alter table public.access_requests add column if not exists email_verified_at timestamptz;
comment on column public.access_requests.email_verified_at is
  'When the applicant first opened a valid emailed link for this application (proof they control the address). Server-written only.';

alter table public.verification_documents drop constraint if exists verification_documents_doc_type_check;
alter table public.verification_documents add constraint verification_documents_doc_type_check check (doc_type in (
  'selfie', 'id_front', 'id_back', 'passport', 'commercial_register', 'tax_card', 'authorization_letter', 'other',
  'profile_photo'));
-- A public profile photo is a picture, never a PDF, and never a camera identity capture.
alter table public.verification_documents drop constraint if exists verification_profile_photo_is_image;
alter table public.verification_documents add constraint verification_profile_photo_is_image check (
  doc_type <> 'profile_photo' or (capture_method = 'upload' and mime in ('image/jpeg', 'image/png', 'image/webp')));

alter table public.verification_events drop constraint if exists verification_events_event_check;
alter table public.verification_events add constraint verification_events_event_check check (event in (
  'created', 'submitted', 'review_started', 'info_requested', 'approved', 'rejected',
  'document_added', 'document_removed', 'document_viewed', 'document_purged',
  'activation_issued', 'account_activated', 'email_verified'));

-- ---------------------------------------------------------------------------
-- Submission guard
-- ---------------------------------------------------------------------------
create or replace function private.verification_submit_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_docs text[];
begin
  if new.status <> 'submitted' or old.status = 'submitted' then
    return new;
  end if;
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
  return new;
end;
$$;
revoke all on function private.verification_submit_guard() from public, anon, authenticated;

drop trigger if exists verification_submit_guard on public.verification_cases;
create trigger verification_submit_guard
  before update of status on public.verification_cases
  for each row execute function private.verification_submit_guard();

-- ---------------------------------------------------------------------------
-- Tokens: a rejected application may still be read (not edited).
-- Same bodies as 0032 except the two status tests marked below.
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
    update public.application_tokens set revoked_at = now()
     where access_request_id = r.id and purpose = 'activation' and revoked_at is null and completed_at is null;
  else
    -- 0039: 'rejected' added, so a rejected applicant can read the decision.
    if r.status not in ('pending', 'rejected') then raise exception 'activation:not_found'; end if;
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
           -- 0039: 'rejected' added (read-only status view).
           when t.purpose = 'resume' and r.status not in ('pending', 'rejected') then 'revoked'
           else 'valid'
         end,
         t.expires_at
    from public.application_tokens t
    join public.access_requests r on r.id = t.access_request_id
   where t.token_hash = p_hash and t.purpose = p_purpose
$$;

revoke all on function public.application_token_issue(uuid, text, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.application_token_lookup(text, text) from public, anon, authenticated;
grant execute on function public.application_token_issue(uuid, text, text, integer, uuid) to service_role;
grant execute on function public.application_token_lookup(text, text) to service_role;

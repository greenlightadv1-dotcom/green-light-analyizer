-- ===========================================================================
-- 0036: Reliable outbound relay lifecycle (creator reply → sponsor email)
-- ===========================================================================
--
-- Spec: docs/EMAIL_FORWARDING_DIAGNOSTIC.md (relay lifecycle)
--
-- WHAT
--   messages gains a relay state machine for the §6 email relay:
--     queued → processing → sent
--                       ↘ failed_retryable → (backoff) → processing …
--                       ↘ failed_permanent
--   plus attempts, the next attempt time, the claim time and the provider's
--   message id. relayed_at / relay_error (0009) stay and are kept in sync.
--   NULL relay_status = a message that is never relayed (in-app rooms,
--   inbound and system messages).
--
--   relay_claim(): compare-and-swap, so two workers never send the same
--   message at once; a claim older than two minutes may be retaken.
--   relay_record(): stores the outcome; a transient failure backs off
--   2, 4, 8, 16 minutes and becomes permanent after 5 attempts.
--   The send itself carries an idempotency key per message (Resend
--   Idempotency-Key), so a retry after an unrecorded success does not send
--   a second email.
--
-- BACKFILL: relayed_at set → 'sent'; relay_error set → 'failed_retryable'
-- (retryable from the admin page once the cause is fixed). Nothing is sent
-- by the migration.
--
-- WHO: service_role only for the functions; the relay columns are not
-- client-writable (0022 removed client writes on messages entirely).
--
-- PREREQUISITES 0009, 0022. IDEMPOTENT.
--
-- ROLLBACK: drop function if exists public.relay_claim(uuid), public.relay_record(uuid, boolean, text, text, boolean);
--   alter table public.messages drop column if exists relay_status, drop column if exists relay_attempts,
--     drop column if exists relay_next_attempt_at, drop column if exists relay_claimed_at,
--     drop column if exists relay_provider_id;
-- ===========================================================================

alter table public.messages
  add column if not exists relay_status text,
  add column if not exists relay_attempts integer not null default 0,
  add column if not exists relay_next_attempt_at timestamptz,
  add column if not exists relay_claimed_at timestamptz,
  add column if not exists relay_provider_id text;
alter table public.messages drop constraint if exists messages_relay_status_check;
alter table public.messages add constraint messages_relay_status_check
  check (relay_status is null or relay_status in ('queued', 'processing', 'sent', 'failed_retryable', 'failed_permanent'));
alter table public.messages drop constraint if exists messages_relay_provider_id_len;
alter table public.messages add constraint messages_relay_provider_id_len check (relay_provider_id is null or char_length(relay_provider_id) <= 120);

update public.messages set relay_status = 'sent' where relay_status is null and relayed_at is not null;
update public.messages set relay_status = 'failed_retryable', relay_attempts = greatest(relay_attempts, 1)
 where relay_status is null and relayed_at is null and relay_error is not null;

create index if not exists messages_relay_due_idx on public.messages (relay_next_attempt_at)
  where relay_status in ('queued', 'failed_retryable');

-- Returns true when this caller now owns the send.
create or replace function public.relay_claim(p_message uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages
     set relay_status = 'processing', relay_claimed_at = now()
   where id = p_message
     and (
       (relay_status in ('queued', 'failed_retryable') and (relay_next_attempt_at is null or relay_next_attempt_at <= now()))
       or (relay_status = 'processing' and relay_claimed_at < now() - interval '2 minutes')
     )
     and relay_attempts < 5;
  return found;
end;
$$;

create or replace function public.relay_record(p_message uuid, p_ok boolean, p_provider_id text, p_error text, p_permanent boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_attempts int; v_status text;
begin
  select relay_attempts + 1 into v_attempts from public.messages where id = p_message and relay_status = 'processing' for update;
  if not found then raise exception 'relay:not_claimed'; end if;
  if p_ok then
    v_status := 'sent';
    update public.messages
       set relay_status = 'sent', relayed_at = now(), relay_error = null, relay_attempts = v_attempts,
           relay_provider_id = left(p_provider_id, 120), relay_next_attempt_at = null, relay_claimed_at = null
     where id = p_message;
  else
    v_status := case when p_permanent or v_attempts >= 5 then 'failed_permanent' else 'failed_retryable' end;
    update public.messages
       set relay_status = v_status, relay_error = left(coalesce(p_error, 'relay failed'), 500), relay_attempts = v_attempts,
           relay_next_attempt_at = case when v_status = 'failed_retryable' then now() + make_interval(mins => power(2, v_attempts)::int) else null end,
           relay_claimed_at = null
     where id = p_message;
  end if;
  return v_status;
end;
$$;

revoke all on function public.relay_claim(uuid) from public, anon, authenticated;
revoke all on function public.relay_record(uuid, boolean, text, text, boolean) from public, anon, authenticated;
grant execute on function public.relay_claim(uuid) to service_role;
grant execute on function public.relay_record(uuid, boolean, text, text, boolean) to service_role;

-- An admin may reset a permanent failure (after fixing its cause) to try again.
create or replace function public.relay_requeue(p_message uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages
     set relay_status = 'queued', relay_attempts = 0, relay_next_attempt_at = null, relay_claimed_at = null
   where id = p_message and relay_status in ('failed_retryable', 'failed_permanent');
  return found;
end;
$$;
revoke all on function public.relay_requeue(uuid) from public, anon, authenticated;
grant execute on function public.relay_requeue(uuid) to service_role;

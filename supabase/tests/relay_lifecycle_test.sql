-- 0036: relay claim is exclusive, outcomes recorded, backoff, permanent after 5, requeue, no client access.
BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('c7000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rl@t.local','x',NOW(),NOW());
INSERT INTO public.profiles (id, full_name, role, primary_email) VALUES ('c7000000-0000-0000-0000-000000000001','Relay Creator','creator','rl@t.local');
INSERT INTO public.deal_chats (id, creator_id, sender_email) VALUES ('c7100000-0000-0000-0000-000000000001','c7000000-0000-0000-0000-000000000001','brand@t.local');
INSERT INTO public.messages (id, chat_id, sender_id, message_text, relay_status) VALUES
  ('c7200000-0000-0000-0000-000000000001','c7100000-0000-0000-0000-000000000001','c7000000-0000-0000-0000-000000000001','hello','queued'),
  ('c7200000-0000-0000-0000-000000000002','c7100000-0000-0000-0000-000000000001','c7000000-0000-0000-0000-000000000001','again','queued');

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_like text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE p_like THEN RAISE NOTICE 'PASS refused: %', SQLERRM; RETURN; END IF;
    RAISE EXCEPTION 'FAIL: % raised "%", expected %', p_sql, SQLERRM, p_like;
  END;
  RAISE EXCEPTION 'FAIL: % succeeded, expected %', p_sql, p_like;
END $$;

DO $$
DECLARE ok boolean; s text; n int;
  m1 uuid := 'c7200000-0000-0000-0000-000000000001'; m2 uuid := 'c7200000-0000-0000-0000-000000000002';
BEGIN
  SET LOCAL ROLE service_role;
  -- Exclusive claim.
  ok := public.relay_claim(m1); IF NOT ok THEN RAISE EXCEPTION 'FAIL: first claim'; END IF;
  ok := public.relay_claim(m1); IF ok THEN RAISE EXCEPTION 'FAIL: second concurrent claim succeeded'; END IF;
  -- Recording requires the claim.
  PERFORM pg_temp.expect_error(format('select public.relay_record(%L,true,%L,null,false)', m2, 'x'), 'relay:not_claimed%');
  s := public.relay_record(m1, true, 're_123', null, false);
  SELECT relay_status || ':' || relay_provider_id || ':' || (relayed_at IS NOT NULL) INTO s FROM public.messages WHERE id = m1;
  IF s <> 'sent:re_123:true' THEN RAISE EXCEPTION 'FAIL: sent state %', s; END IF;
  ok := public.relay_claim(m1); IF ok THEN RAISE EXCEPTION 'FAIL: a sent message was claimed again'; END IF;
  RAISE NOTICE 'PASS exclusive claim; a sent message is never sent again';

  -- Transient failure backs off; not claimable until due.
  PERFORM public.relay_claim(m2);
  s := public.relay_record(m2, false, null, 'Resend returned 503', false);
  IF s <> 'failed_retryable' THEN RAISE EXCEPTION 'FAIL: % after transient failure', s; END IF;
  ok := public.relay_claim(m2); IF ok THEN RAISE EXCEPTION 'FAIL: claimed before backoff elapsed'; END IF;
  RESET ROLE;
  UPDATE public.messages SET relay_next_attempt_at = now() - interval '1 second' WHERE id = m2;
  SET LOCAL ROLE service_role;
  ok := public.relay_claim(m2); IF NOT ok THEN RAISE EXCEPTION 'FAIL: due retry not claimable'; END IF;
  -- Permanent failure stops retries.
  s := public.relay_record(m2, false, null, 'Resend returned 422', true);
  IF s <> 'failed_permanent' THEN RAISE EXCEPTION 'FAIL: % after permanent failure', s; END IF;
  ok := public.relay_claim(m2); IF ok THEN RAISE EXCEPTION 'FAIL: permanent failure claimed'; END IF;
  -- An admin requeue makes it retryable from scratch.
  ok := public.relay_requeue(m2); IF NOT ok THEN RAISE EXCEPTION 'FAIL: requeue'; END IF;
  ok := public.relay_requeue(m1); IF ok THEN RAISE EXCEPTION 'FAIL: a sent message was requeued'; END IF;
  -- Five transient failures become permanent.
  FOR n IN 1..5 LOOP
    RESET ROLE; UPDATE public.messages SET relay_next_attempt_at = null WHERE id = m2; SET LOCAL ROLE service_role;
    PERFORM public.relay_claim(m2);
    s := public.relay_record(m2, false, null, 'timeout', false);
  END LOOP;
  IF s <> 'failed_permanent' THEN RAISE EXCEPTION 'FAIL: after 5 attempts %', s; END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS backoff, permanent failures, requeue, attempt cap';

  -- A stale processing claim (crashed worker) can be retaken.
  UPDATE public.messages SET relay_status = 'processing', relay_attempts = 0, relay_claimed_at = now() - interval '5 minutes' WHERE id = m2;
  SET LOCAL ROLE service_role;
  ok := public.relay_claim(m2); IF NOT ok THEN RAISE EXCEPTION 'FAIL: stale claim not retaken'; END IF;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"c7000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  PERFORM pg_temp.expect_error(format('select public.relay_claim(%L)', m2), '%permission denied%');
  PERFORM pg_temp.expect_error(format('update public.messages set relay_status = %L where id = %L', 'sent', m2), '%permission denied%');
  RESET ROLE;
  RAISE NOTICE 'PASS stale claim recovery; clients cannot touch the relay state';
END $$;
ROLLBACK;

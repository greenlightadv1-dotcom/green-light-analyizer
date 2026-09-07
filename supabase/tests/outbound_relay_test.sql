-- ---------------------------------------------------------------------------
-- Green Light — outbound relay regression test (§6)
--
-- 0009 added messages.relayed_at / relay_error. Whether a message actually
-- reached the company is the server's finding about delivery: a sender who
-- could write relayed_at could fake a delivery that never happened, and a
-- creator who could clear relay_error could hide one that failed.
--
-- Also re-checks, after nine migrations, that the isolation guarantees from
-- 0003/0004 still hold — a regression there is silent and catastrophic.
--
--   psql "$DATABASE_URL" -f supabase/tests/outbound_relay_test.sql
-- ---------------------------------------------------------------------------

BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.local','x',NOW(),NOW()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.local','x',NOW(),NOW()),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@test.local','x',NOW(),NOW());

INSERT INTO public.profiles (id, full_name, role, primary_email, inbound_alias, subscription_plan) VALUES
  ('11111111-1111-1111-1111-111111111111','Creator A','creator','a-real@gmail.com','amir.k3f9x2@analyze.greenlight.com','Pro'),
  ('22222222-2222-2222-2222-222222222222','Creator B','creator','b-real@gmail.com','beeka.p8q1z7@analyze.greenlight.com','Starter'),
  ('33333333-3333-3333-3333-333333333333','The Admin','admin','admin@greenlight.com',NULL,'Elite');

INSERT INTO public.deal_chats (id, creator_id, sender_email, deal_status, ai_evaluation, offered_amount, sponsorship_type)
VALUES ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','deals@brand.com','new','yellow',500,'integration');

INSERT INTO public.messages (id, chat_id, sender_id, message_text, is_masked)
VALUES ('66666666-6666-6666-6666-666666666666','44444444-4444-4444-4444-444444444444',
        '11111111-1111-1111-1111-111111111111','Happy to discuss.', FALSE);

CREATE TEMP TABLE r(id int, test text, expected text, got text) ON COMMIT DROP;
GRANT ALL ON TABLE r TO authenticated, anon;

DO $t$
DECLARE
  a uuid := '11111111-1111-1111-1111-111111111111';
  b uuid := '22222222-2222-2222-2222-222222222222';
  n int; affected int; flag boolean;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);

  BEGIN
    UPDATE public.messages SET relayed_at = NOW() WHERE sender_id = a;
    INSERT INTO r VALUES (1,'creator marks own message as delivered','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (1,'creator marks own message as delivered','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  BEGIN
    UPDATE public.messages SET relay_error = NULL WHERE sender_id = a;
    INSERT INTO r VALUES (2,'creator clears a relay error','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (2,'creator clears a relay error','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  -- They can still SEE whether their reply landed; they just cannot write it.
  SELECT count(*) INTO n FROM public.messages WHERE chat_id = '44444444-4444-4444-4444-444444444444';
  INSERT INTO r VALUES (3,'creator reads own thread incl. relay state','1 rows', n||' rows');

  -- The alias is the reply path handed out to companies. It stays the
  -- platform's to issue, not the creator's to point somewhere else.
  BEGIN
    UPDATE public.profiles SET inbound_alias = 'attacker@evil.com' WHERE id = a;
    INSERT INTO r VALUES (4,'creator rewrites own inbound alias','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (4,'creator rewrites own inbound alias','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  -- Still true after nine migrations.
  RESET ROLE; SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.messages;
  INSERT INTO r VALUES (5,'B reads A thread','0 rows', n||' rows');
  SELECT count(*) INTO n FROM public.profiles;
  INSERT INTO r VALUES (6,'B reads other profiles','1 rows', n||' rows');

  -- The server's own bookkeeping still works.
  RESET ROLE;
  UPDATE public.messages SET relayed_at = NOW(), relay_error = NULL
  WHERE id = '66666666-6666-6666-6666-666666666666';
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO r VALUES (7,'server records a successful relay','1', affected::text);

  SELECT (relayed_at IS NOT NULL) INTO flag FROM public.messages
  WHERE id = '66666666-6666-6666-6666-666666666666';
  INSERT INTO r VALUES (8,'relay state persists','true', flag::text);

  RESET ROLE; SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    SELECT count(*) INTO n FROM public.messages;
    INSERT INTO r VALUES (9,'anon reads messages','no access', n||' rows');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (9,'anon reads messages','no access','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  RESET ROLE;
END
$t$;

SELECT id, test, expected, got,
  CASE WHEN (expected='blocked' AND got LIKE 'blocked:%')
         OR (expected='no access' AND (got LIKE 'blocked:%' OR got='0 rows'))
         OR (expected=got)
       THEN 'PASS' ELSE '*** FAIL ***' END AS verdict
FROM r ORDER BY id;

ROLLBACK;

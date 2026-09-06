-- ---------------------------------------------------------------------------
-- Green Light — inbound email intake regression test (§5)
--
-- Covers the database-side invariants processInboundEmail() depends on:
-- alias resolution, the idempotency claim that stops a provider retry
-- duplicating a deal room, thread continuation, and who can see the trail.
--
--   psql "$DATABASE_URL" -f supabase/tests/email_intake_test.sql
--
-- Rolls back; safe against the live project.
--
-- What this file does NOT cover: the webhook route itself. That is
-- scripts/webhook-e2e.mjs, which drives real HTTP with real signatures — and
-- has to, because a route can be perfectly correct and still unreachable. It
-- caught exactly that once: the auth proxy was redirecting /api/webhooks/* to
-- /login, so deliveries returned 200 without being processed.
-- ---------------------------------------------------------------------------

BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.local','x',NOW(),NOW()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.local','x',NOW(),NOW()),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@test.local','x',NOW(),NOW());

INSERT INTO public.profiles (id, full_name, role, primary_email, inbound_alias) VALUES
  ('11111111-1111-1111-1111-111111111111','Creator A','creator','a@gmail.com','amir.k3f9x2@analyze.greenlight.com'),
  ('22222222-2222-2222-2222-222222222222','Creator B','creator','b@gmail.com','beeka.p8q1z7@analyze.greenlight.com'),
  ('33333333-3333-3333-3333-333333333333','The Admin','admin','admin@greenlight.com',NULL);

CREATE TEMP TABLE r(id int, test text, expected text, got text) ON COMMIT DROP;
GRANT ALL ON TABLE r TO authenticated, anon;

DO $t$
DECLARE
  a uuid := '11111111-1111-1111-1111-111111111111';
  b uuid := '22222222-2222-2222-2222-222222222222';
  adm uuid := '33333333-3333-3333-3333-333333333333';
  n int; resolved uuid; chat uuid;
BEGIN
  -- ===== §5.4 alias resolution =====
  -- Case-insensitive because a forwarding rule emits whatever case it likes,
  -- and a creator whose offers silently vanish over letter case has no way to
  -- diagnose it.
  SELECT id INTO resolved FROM public.profiles
  WHERE lower(inbound_alias) = lower('AMIR.K3F9X2@Analyze.GreenLight.com');
  INSERT INTO r VALUES (1,'alias resolves case-insensitively', a::text, COALESCE(resolved::text,'null'));

  SELECT id INTO resolved FROM public.profiles
  WHERE lower(inbound_alias) = lower('nobody.zz0000@analyze.greenlight.com');
  INSERT INTO r VALUES (2,'unknown alias resolves to nothing','null', COALESCE(resolved::text,'null'));

  -- ===== idempotency =====
  INSERT INTO public.inbound_emails (provider_message_id, to_alias, creator_id, sender_email, status, detail)
  VALUES ('msg_dup_1','amir.k3f9x2@analyze.greenlight.com', a, 'deals@brand.com','processed','created a deal room');
  INSERT INTO r VALUES (3,'first delivery is recorded','1','1');

  -- The claim the whole retry story rests on. Without it, every Resend retry
  -- mints a second room and a second paid Gemini call for the same offer.
  BEGIN
    INSERT INTO public.inbound_emails (provider_message_id, status)
    VALUES ('msg_dup_1','processed');
    INSERT INTO r VALUES (4,'retry of the same delivery','blocked','ALLOWED — WOULD DUPLICATE');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO r VALUES (4,'retry of the same delivery','blocked','blocked: unique_violation');
  END;

  -- ===== the room the intake creates =====
  INSERT INTO public.deal_chats (id, creator_id, company_id, sender_email, deal_status, offered_amount, ai_evaluation, sponsorship_type)
  VALUES ('44444444-4444-4444-4444-444444444444', a, NULL, 'deals@brand.com','new',500,'yellow','video_dedicated');

  -- Platform-authored messages carry a null sender_id: neither the Co-Pilot
  -- summary nor an offer relayed in from email has an account behind it.
  INSERT INTO public.messages (chat_id, sender_id, message_text, is_masked)
  VALUES ('44444444-4444-4444-4444-444444444444', NULL, 'Deal Co-Pilot — YELLOW', FALSE),
         ('44444444-4444-4444-4444-444444444444', NULL,
          'We can pay $500. Reach me on [locked: phone hidden by platform policy] or [locked: external link hidden]', TRUE);
  INSERT INTO r VALUES (5,'system messages accept a null sender','allowed','allowed');

  -- ===== thread continuation =====
  SELECT id INTO chat FROM public.deal_chats
  WHERE creator_id = a AND lower(sender_email) = lower('DEALS@Brand.com') AND deal_status <> 'paid'
  ORDER BY created_at DESC LIMIT 1;
  INSERT INTO r VALUES (6,'reply finds the open room','44444444-4444-4444-4444-444444444444', COALESCE(chat::text,'null'));

  -- A settled deal is closed: later mail from the same sponsor is a new offer,
  -- not more negotiation on one already paid.
  UPDATE public.deal_chats SET deal_status = 'paid' WHERE id = '44444444-4444-4444-4444-444444444444';
  SELECT id INTO chat FROM public.deal_chats
  WHERE creator_id = a AND lower(sender_email) = lower('deals@brand.com') AND deal_status <> 'paid'
  ORDER BY created_at DESC LIMIT 1;
  INSERT INTO r VALUES (7,'a settled deal does not absorb a new offer','null', COALESCE(chat::text,'null'));

  -- ===== who sees the trail =====
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);

  SELECT count(*) INTO n FROM public.inbound_emails;
  INSERT INTO r VALUES (8,'creator reads the intake trail','0 rows', n||' rows');

  SELECT count(*) INTO n FROM public.messages WHERE chat_id = '44444444-4444-4444-4444-444444444444';
  INSERT INTO r VALUES (9,'creator reads their own emailed room','2 rows', n||' rows');

  RESET ROLE; SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.messages;
  INSERT INTO r VALUES (10,'another creator reads that room','0 rows', n||' rows');

  RESET ROLE; SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.inbound_emails;
  INSERT INTO r VALUES (11,'admin reads the intake trail','1 rows', n||' rows');

  RESET ROLE; SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    SELECT count(*) INTO n FROM public.inbound_emails;
    INSERT INTO r VALUES (12,'anon reads the intake trail','no access', n||' rows');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (12,'anon reads the intake trail','no access','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  RESET ROLE;
END
$t$;

SELECT id, test, expected, got,
  CASE WHEN (expected='blocked' AND got LIKE 'blocked:%')
         OR (expected='allowed' AND got='allowed')
         OR (expected='no access' AND (got LIKE 'blocked:%' OR got='0 rows'))
         OR (expected=got)
       THEN 'PASS' ELSE '*** FAIL ***' END AS verdict
FROM r ORDER BY id;

ROLLBACK;

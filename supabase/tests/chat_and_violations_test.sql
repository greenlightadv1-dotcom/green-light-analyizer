-- ---------------------------------------------------------------------------
-- Green Light — Deal Chat Room + violation log regression test
--
-- Companion to rls_policies_test.sql, covering what 0006 added: thread
-- isolation, message immutability, and the §6 violation audit trail.
--
--   psql "$DATABASE_URL" -f supabase/tests/chat_and_violations_test.sql
--
-- A NOTE ON ASSERTION STYLE, learned the hard way:
--
-- RLS does not reject an UPDATE that targets rows the caller cannot see — it
-- filters them out, so the statement succeeds having changed nothing. An
-- "expected an exception" assertion therefore reports a false failure on
-- exactly the cases RLS handles by invisibility rather than by refusal.
--
-- So: use GET DIAGNOSTICS ROW_COUNT (and re-read the row) for anything the
-- policy hides, and reserve exception-catching for column privileges, which
-- genuinely do raise "permission denied".
-- ---------------------------------------------------------------------------

BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.local','x',NOW(),NOW()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.local','x',NOW(),NOW()),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@test.local','x',NOW(),NOW());

INSERT INTO public.profiles (id, full_name, role, primary_email) VALUES
  ('11111111-1111-1111-1111-111111111111','Creator A','creator','a@gmail.com'),
  ('22222222-2222-2222-2222-222222222222','Creator B','creator','b@gmail.com'),
  ('33333333-3333-3333-3333-333333333333','The Admin','admin','admin@greenlight.com');

INSERT INTO public.deal_chats (id, creator_id, sender_email, deal_status, ai_evaluation, offered_amount, sponsorship_type)
VALUES ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','brand@sponsor.com','new','yellow',500,'integration');

-- What sendMessage() actually writes: masked text plus the audit row. The raw
-- string never reaches the database, so the fixture must not contain one either.
INSERT INTO public.messages (id, chat_id, sender_id, message_text, is_masked)
VALUES ('66666666-6666-6666-6666-666666666666','44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111',
        'sure, ping me on [locked: phone hidden by platform policy] or [locked: external link hidden]', TRUE);

INSERT INTO public.violation_logs (id, profile_id, chat_id, message_id, matched_rules, redacted_excerpt)
VALUES ('77777777-7777-7777-7777-777777777777','11111111-1111-1111-1111-111111111111',
        '44444444-4444-4444-4444-444444444444','66666666-6666-6666-6666-666666666666',
        ARRAY['phone','social'],'sure, ping me on [locked: phone hidden by platform policy] or [locked: external link hidden]');

CREATE TEMP TABLE r(id int, test text, expected text, got text) ON COMMIT DROP;
GRANT ALL ON TABLE r TO authenticated, anon;

DO $t$
DECLARE
  a   uuid := '11111111-1111-1111-1111-111111111111';
  b   uuid := '22222222-2222-2222-2222-222222222222';
  adm uuid := '33333333-3333-3333-3333-333333333333';
  n int; affected int; txt text; flag boolean;
BEGIN
  -- ===== creator A, the sender =====
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);

  SELECT count(*) INTO n FROM public.messages WHERE chat_id = '44444444-4444-4444-4444-444444444444';
  INSERT INTO r VALUES (1,'A reads own thread','1 rows', n||' rows');

  SELECT message_text INTO txt FROM public.messages LIMIT 1;
  INSERT INTO r VALUES (2,'stored message text is masked','masked',
    CASE WHEN txt LIKE '%[locked:%' THEN 'masked' ELSE 'RAW LEAK: '||txt END);

  SELECT count(*) INTO n FROM public.violation_logs;
  INSERT INTO r VALUES (3,'A reads the violation log about themselves','0 rows', n||' rows');

  -- Row-invisibility case: succeeds, changes nothing.
  UPDATE public.violation_logs SET reviewed_at = NOW();
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO r VALUES (4,'rows A can mark reviewed (suppressing the report)','0', affected::text);

  -- Column-privilege cases: these genuinely raise.
  BEGIN
    UPDATE public.messages SET message_text = 'rewritten' WHERE sender_id = a;
    INSERT INTO r VALUES (5,'A rewrites a message already sent','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (5,'A rewrites a message already sent','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  BEGIN
    UPDATE public.messages SET is_masked = FALSE WHERE sender_id = a;
    INSERT INTO r VALUES (6,'A clears the filtered flag on own message','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (6,'A clears the filtered flag on own message','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  BEGIN
    UPDATE public.profiles SET banned_at = NULL WHERE id = a;
    INSERT INTO r VALUES (7,'A clears own ban flag','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (7,'A clears own ban flag','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  -- ===== creator B: the thread and its audit trail do not exist =====
  RESET ROLE; SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);

  SELECT count(*) INTO n FROM public.messages;
  INSERT INTO r VALUES (8,'B reads A thread','0 rows', n||' rows');
  SELECT count(*) INTO n FROM public.violation_logs;
  INSERT INTO r VALUES (9,'B reads A violation log','0 rows', n||' rows');

  -- ===== the entry survived both creators =====
  RESET ROLE;
  SELECT (reviewed_at IS NULL) INTO flag
  FROM public.violation_logs WHERE id = '77777777-7777-7777-7777-777777777777';
  INSERT INTO r VALUES (10,'violation still pending after creators tried','true', flag::text);

  -- ===== admin works the queue =====
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);

  SELECT count(*) INTO n FROM public.violation_logs WHERE reviewed_at IS NULL;
  INSERT INTO r VALUES (11,'admin reads the violation queue','1 rows', n||' rows');

  UPDATE public.violation_logs SET reviewed_at = NOW(), reviewed_by = adm;
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO r VALUES (12,'rows an admin can mark reviewed','1', affected::text);

  -- ===== anon =====
  RESET ROLE; SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    SELECT count(*) INTO n FROM public.violation_logs;
    INSERT INTO r VALUES (13,'anon reads violation logs','no access', n||' rows');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (13,'anon reads violation logs','no access','blocked: '||split_part(SQLERRM,E'\n',1));
  END;
  BEGIN
    SELECT count(*) INTO n FROM public.messages;
    INSERT INTO r VALUES (14,'anon reads messages','no access', n||' rows');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (14,'anon reads messages','no access','blocked: '||split_part(SQLERRM,E'\n',1));
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

-- Chat transport must be published, or the room never updates live (§9).
SELECT tablename, 'must be published' AS note
FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename IN ('messages','deal_chats')
ORDER BY tablename;

ROLLBACK;

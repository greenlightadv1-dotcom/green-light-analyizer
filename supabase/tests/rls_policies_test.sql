-- ---------------------------------------------------------------------------
-- Green Light — RLS regression test
--
-- A clean Supabase linter proves RLS is switched on. It does not prove the
-- policies isolate anything. This does.
--
-- Runs entirely inside a transaction that ROLLBACKs, so it leaves no rows
-- behind and is safe to run against the live project. It impersonates roles
-- the way PostgREST does — SET LOCAL ROLE plus a request.jwt.claims sub — so
-- auth.uid() resolves exactly as it would for a real signed-in caller.
--
-- Run it after any change to 0003 or 0004. Every row must read PASS.
--
--   psql "$DATABASE_URL" -f supabase/tests/rls_policies_test.sql
--
-- Covers:
--   1-4   creator B cannot read ANY of creator A's rows (the §6 PII boundary)
--   5     creator B cannot post into A's thread with a known chat_id
--   6-8   creator A can read their own rows, and only their own
--   9-10  creator A cannot escalate their role or self-upgrade their plan
--   11    creator A cannot forge audience_verified (§1, §7.2 anti-fraud)
--   12    creator A cannot forge the AI risk rating
--   13-14 creator A can negotiate but cannot mark a deal paid (§12 escrow)
--   15    creator A can still edit their own display name
--   16-18 admin sees everything
--   19-23 anon can reach nothing at all (since 0005 it holds no grant either)
-- ---------------------------------------------------------------------------

BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.local','x',NOW(),NOW()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.local','x',NOW(),NOW()),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@test.local','x',NOW(),NOW());

INSERT INTO public.profiles (id, full_name, role, primary_email, inbound_alias) VALUES
  ('11111111-1111-1111-1111-111111111111','Creator A','creator','a-real-email@gmail.com','a.abc123@analyze.greenlight.com'),
  ('22222222-2222-2222-2222-222222222222','Creator B','creator','b-real-email@gmail.com','b.def456@analyze.greenlight.com'),
  ('33333333-3333-3333-3333-333333333333','The Admin','admin','admin@greenlight.com',NULL);

INSERT INTO public.media_kits (id, creator_id, platform, avg_views, declared_top_countries, audience_verified)
VALUES ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','youtube',10000,'[{"country":"EG","pct":40}]'::jsonb,FALSE);

INSERT INTO public.deal_chats (id, creator_id, sender_email, deal_status, ai_evaluation, offered_amount)
VALUES ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','brand@sponsor.com','new','yellow',500);

INSERT INTO public.messages (id, chat_id, sender_id, message_text)
VALUES ('66666666-6666-6666-6666-666666666666','44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','Hello from A');

CREATE TEMP TABLE r(id int, test text, expected text, got text) ON COMMIT DROP;
GRANT ALL ON TABLE r TO authenticated, anon;

DO $test$
DECLARE
  a   uuid := '11111111-1111-1111-1111-111111111111';
  b   uuid := '22222222-2222-2222-2222-222222222222';
  adm uuid := '33333333-3333-3333-3333-333333333333';
  n   int;
BEGIN
  -- ===== creator B: must see and touch nothing of A's =====
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);

  SELECT count(*) INTO n FROM public.profiles WHERE id = a;
  INSERT INTO r VALUES (1,'B reads A profile (real email + alias)','0 rows', n||' rows');
  SELECT count(*) INTO n FROM public.deal_chats WHERE creator_id = a;
  INSERT INTO r VALUES (2,'B reads A deal_chat','0 rows', n||' rows');
  SELECT count(*) INTO n FROM public.messages;
  INSERT INTO r VALUES (3,'B reads A messages','0 rows', n||' rows');
  SELECT count(*) INTO n FROM public.media_kits;
  INSERT INTO r VALUES (4,'B reads A media_kit','0 rows', n||' rows');

  BEGIN
    INSERT INTO public.messages (chat_id, sender_id, message_text)
    VALUES ('44444444-4444-4444-4444-444444444444', b, 'B injecting into A thread');
    INSERT INTO r VALUES (5,'B posts into A thread','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (5,'B posts into A thread','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  -- ===== creator A: own rows only, narrow write surface =====
  RESET ROLE; SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);

  SELECT count(*) INTO n FROM public.deal_chats;
  INSERT INTO r VALUES (6,'A reads own deal_chat','1 rows', n||' rows');
  SELECT count(*) INTO n FROM public.messages;
  INSERT INTO r VALUES (7,'A reads own messages','1 rows', n||' rows');
  SELECT count(*) INTO n FROM public.profiles;
  INSERT INTO r VALUES (8,'A reads profiles (own only)','1 rows', n||' rows');

  BEGIN
    UPDATE public.profiles SET role = 'admin' WHERE id = a;
    INSERT INTO r VALUES (9,'A escalates own role to admin','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (9,'A escalates own role to admin','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  BEGIN
    UPDATE public.profiles SET subscription_plan = 'Elite' WHERE id = a;
    INSERT INTO r VALUES (10,'A self-upgrades plan to Elite','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (10,'A self-upgrades plan to Elite','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  BEGIN
    UPDATE public.media_kits SET audience_verified = TRUE WHERE creator_id = a;
    INSERT INTO r VALUES (11,'A forges audience_verified','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (11,'A forges audience_verified','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  BEGIN
    UPDATE public.deal_chats SET ai_evaluation = 'green' WHERE creator_id = a;
    INSERT INTO r VALUES (12,'A forges green risk rating','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (12,'A forges green risk rating','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  BEGIN
    UPDATE public.deal_chats SET deal_status = 'paid' WHERE creator_id = a;
    INSERT INTO r VALUES (13,'A marks own deal paid (escrow)','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (13,'A marks own deal paid (escrow)','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  BEGIN
    UPDATE public.deal_chats SET deal_status = 'negotiating' WHERE creator_id = a;
    INSERT INTO r VALUES (14,'A moves own deal to negotiating','allowed','allowed');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (14,'A moves own deal to negotiating','allowed','BLOCKED: '||split_part(SQLERRM,E'\n',1));
  END;

  BEGIN
    UPDATE public.profiles SET full_name = 'A Renamed' WHERE id = a;
    INSERT INTO r VALUES (15,'A edits own display name','allowed','allowed');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (15,'A edits own display name','allowed','BLOCKED: '||split_part(SQLERRM,E'\n',1));
  END;

  -- ===== admin: full read =====
  RESET ROLE; SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);

  SELECT count(*) INTO n FROM public.profiles;
  INSERT INTO r VALUES (16,'Admin reads all profiles','3 rows', n||' rows');
  SELECT count(*) INTO n FROM public.deal_chats;
  INSERT INTO r VALUES (17,'Admin reads all deal_chats','1 rows', n||' rows');
  SELECT count(*) INTO n FROM public.messages;
  INSERT INTO r VALUES (18,'Admin reads all messages','1 rows', n||' rows');

  -- ===== anon: nothing =====
  RESET ROLE; SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Since 0005, anon holds no grant at all on these tables, so each of these
  -- fails at the privilege check before RLS is even consulted. Either outcome
  -- (no rows, or permission denied) counts as no access; permission denied is
  -- the stronger one and is what should be seen now.
  BEGIN
    SELECT count(*) INTO n FROM public.profiles;
    INSERT INTO r VALUES (19,'anon reads profiles','no access', n||' rows');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (19,'anon reads profiles','no access','blocked: '||split_part(SQLERRM,E'\n',1));
  END;
  BEGIN
    SELECT count(*) INTO n FROM public.messages;
    INSERT INTO r VALUES (20,'anon reads messages','no access', n||' rows');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (20,'anon reads messages','no access','blocked: '||split_part(SQLERRM,E'\n',1));
  END;
  BEGIN
    SELECT count(*) INTO n FROM public.media_kits;
    INSERT INTO r VALUES (21,'anon reads media_kits','no access', n||' rows');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (21,'anon reads media_kits','no access','blocked: '||split_part(SQLERRM,E'\n',1));
  END;
  BEGIN
    SELECT count(*) INTO n FROM public.deal_chats;
    INSERT INTO r VALUES (22,'anon reads deal_chats','no access', n||' rows');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (22,'anon reads deal_chats','no access','blocked: '||split_part(SQLERRM,E'\n',1));
  END;
  BEGIN
    INSERT INTO public.messages (chat_id, sender_id, message_text)
    VALUES ('44444444-4444-4444-4444-444444444444', a, 'anon write');
    INSERT INTO r VALUES (23,'anon writes a message','no access','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (23,'anon writes a message','no access','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  RESET ROLE;
END
$test$;

SELECT id, test, expected, got,
       CASE WHEN (expected = 'blocked' AND got LIKE 'blocked:%')
              OR (expected = 'allowed' AND got = 'allowed')
              OR (expected = 'no access' AND (got LIKE 'blocked:%' OR got = '0 rows'))
              OR (expected = got)
            THEN 'PASS' ELSE '*** FAIL ***' END AS verdict
FROM r ORDER BY id;

ROLLBACK;

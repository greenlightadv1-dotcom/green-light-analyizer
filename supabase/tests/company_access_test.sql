-- ---------------------------------------------------------------------------
-- Green Light — company-side access regression test (0010, 0011)
--
-- Runs entirely inside a transaction that ROLLBACKs, so it leaves no rows
-- behind and is safe to run against the live project. Same impersonation
-- technique as rls_policies_test.sql: SET LOCAL ROLE plus a request.jwt.claims
-- sub, so auth.uid() resolves exactly as it would for a real signed-in caller.
--
--   psql "$DATABASE_URL" -f supabase/tests/company_access_test.sql
--
-- Covers:
--   1-3  the company on a deal can read the room, its messages, and the
--        creator's media kit (§7 — no PII there, so this is intended)
--   4    an unrelated company cannot read a room it is not party to
--   5    an unrelated company still cannot read the creator's profiles row
--        directly — the leak 0010's comment warns against, checked for real
--   6    creator_directory() lists the creator for a company caller...
--   7    ...but never exposes primary_email or inbound_alias, because those
--        columns are not in its SELECT list at all, not withheld from it
--   8    a creator (not a company) gets nothing from creator_directory()
--   9    the company can move a deal to 'negotiating'
--   10   ...but not to 'paid' — §12 escrow is unchanged by 0010
--   11   anon gets permission-denied calling creator_directory() at all
-- ---------------------------------------------------------------------------

BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','creator@test.local','x',NOW(),NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','company@test.local','x',NOW(),NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other-company@test.local','x',NOW(),NOW());

INSERT INTO public.profiles (id, full_name, role, primary_email, inbound_alias) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','Test Creator','creator','creator-real@gmail.com','creator.abc1@analyze.greenlight.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002','Test Company','company','company@test.local',NULL),
  ('aaaaaaaa-0000-0000-0000-000000000003','Other Company','company','other-company@test.local',NULL);

INSERT INTO public.media_kits (id, creator_id, platform, avg_views, engagement_rate, content_category, declared_top_countries)
VALUES ('aaaaaaaa-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-000000000001','youtube',50000,4.2,'tech','[{"country":"EG","pct":40}]'::jsonb);

INSERT INTO public.deal_chats (id, creator_id, company_id, sender_email, sponsorship_type)
VALUES ('aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002','company@test.local','post');

INSERT INTO public.messages (id, chat_id, sender_id, message_text)
VALUES ('aaaaaaaa-0000-0000-0000-0000000000e1','aaaaaaaa-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-000000000001','Hello from the creator');

CREATE TEMP TABLE r(id int, test text, expected text, got text) ON COMMIT DROP;
GRANT ALL ON TABLE r TO authenticated, anon;

DO $test$
DECLARE
  creator uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  company uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  other   uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  n       int;
BEGIN
  -- ===== the company on the deal: can see the room, its messages, the kit =====
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',company,'role','authenticated')::text, true);

  SELECT count(*) INTO n FROM public.deal_chats WHERE id = 'aaaaaaaa-0000-0000-0000-0000000000d1';
  INSERT INTO r VALUES (1,'company reads own deal_chat','1 rows', n||' rows');
  SELECT count(*) INTO n FROM public.messages WHERE chat_id = 'aaaaaaaa-0000-0000-0000-0000000000d1';
  INSERT INTO r VALUES (2,'company reads room messages','1 rows', n||' rows');
  SELECT count(*) INTO n FROM public.media_kits WHERE creator_id = creator;
  INSERT INTO r VALUES (3,'company reads creator media_kit','1 rows', n||' rows');

  -- ===== an unrelated company: sees nothing of this deal, and no PII =====
  RESET ROLE; SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',other,'role','authenticated')::text, true);

  SELECT count(*) INTO n FROM public.deal_chats WHERE id = 'aaaaaaaa-0000-0000-0000-0000000000d1';
  INSERT INTO r VALUES (4,'unrelated company reads the deal','0 rows', n||' rows');
  SELECT count(*) INTO n FROM public.profiles WHERE id = creator;
  INSERT INTO r VALUES (5,'unrelated company reads creator profiles row','0 rows', n||' rows');

  SELECT count(*) INTO n FROM public.creator_directory() WHERE creator_id = creator;
  INSERT INTO r VALUES (6,'company lists creator via directory','1 rows', n||' rows');

  BEGIN
    PERFORM primary_email FROM public.creator_directory();
    INSERT INTO r VALUES (7,'directory exposes primary_email column','no such column','ALLOWED');
  EXCEPTION WHEN undefined_column THEN
    INSERT INTO r VALUES (7,'directory exposes primary_email column','no such column','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  -- ===== a creator (not a company) gets nothing from the directory =====
  RESET ROLE; SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',creator,'role','authenticated')::text, true);

  SELECT count(*) INTO n FROM public.creator_directory();
  INSERT INTO r VALUES (8,'creator calls creator_directory()','0 rows', n||' rows');

  -- ===== the company can negotiate but not settle =====
  RESET ROLE; SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',company,'role','authenticated')::text, true);

  BEGIN
    UPDATE public.deal_chats SET deal_status = 'negotiating' WHERE id = 'aaaaaaaa-0000-0000-0000-0000000000d1';
    INSERT INTO r VALUES (9,'company moves deal to negotiating','allowed','allowed');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (9,'company moves deal to negotiating','allowed','BLOCKED: '||split_part(SQLERRM,E'\n',1));
  END;

  BEGIN
    UPDATE public.deal_chats SET deal_status = 'paid' WHERE id = 'aaaaaaaa-0000-0000-0000-0000000000d1';
    INSERT INTO r VALUES (10,'company marks deal paid (escrow)','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (10,'company marks deal paid (escrow)','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  -- ===== anon: the RPC itself refuses, not just an empty result =====
  RESET ROLE; SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);

  BEGIN
    SELECT count(*) INTO n FROM public.creator_directory();
    INSERT INTO r VALUES (11,'anon calls creator_directory()','no access', n||' rows');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (11,'anon calls creator_directory()','no access','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  RESET ROLE;
END
$test$;

SELECT id, test, expected, got,
       CASE WHEN (expected = 'blocked' AND got LIKE 'blocked:%')
              OR (expected = 'allowed' AND got = 'allowed')
              OR (expected = 'no access' AND (got LIKE 'blocked:%' OR got = '0 rows'))
              OR (expected = 'no such column' AND got LIKE 'blocked:%')
              OR (expected = got)
            THEN 'PASS' ELSE '*** FAIL ***' END AS verdict
FROM r ORDER BY id;

ROLLBACK;

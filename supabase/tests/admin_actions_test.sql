-- ---------------------------------------------------------------------------
-- Green Light — admin_actions audit trail regression test (migration 0012)
--
--   psql "$DATABASE_URL" -f supabase/tests/admin_actions_test.sql
--
-- Only one thing to prove at the database layer: admin_actions_select reads
-- like every other admin-only table here (is_admin() or nothing). The
-- self-ban/self-demote guard lives in the server actions, not a policy — a
-- row-level check can't see who the *acting* user is trying to target versus
-- themselves without a chat_id-shaped join that doesn't exist for this table,
-- so that guard is application code and is not re-tested here.
-- ---------------------------------------------------------------------------

BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.local','x',NOW(),NOW()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.local','x',NOW(),NOW()),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@test.local','x',NOW(),NOW());

INSERT INTO public.profiles (id, full_name, role, primary_email) VALUES
  ('11111111-1111-1111-1111-111111111111','Creator A','creator','a@gmail.com'),
  ('22222222-2222-2222-2222-222222222222','Company B','company','b@gmail.com'),
  ('33333333-3333-3333-3333-333333333333','The Admin','admin','admin@greenlight.com');

-- Simulates what updateProfile() would have written for an earlier edit.
INSERT INTO public.admin_actions (id, admin_id, target_profile_id, action, old_value, new_value)
VALUES ('55555555-5555-5555-5555-555555555555',
        '33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111',
        'plan_change','Starter','Pro');

CREATE TEMP TABLE r(id int, test text, expected text, got text) ON COMMIT DROP;
GRANT ALL ON TABLE r TO authenticated, anon;

DO $test$
DECLARE
  a   uuid := '11111111-1111-1111-1111-111111111111';
  b   uuid := '22222222-2222-2222-2222-222222222222';
  adm uuid := '33333333-3333-3333-3333-333333333333';
  n int;
BEGIN
  -- ===== admin reads the audit trail =====
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);

  SELECT count(*) INTO n FROM public.admin_actions;
  INSERT INTO r VALUES (1,'admin reads admin_actions','1 rows', n||' rows');

  -- ===== creator: the row about them is invisible, not just filtered on read =====
  RESET ROLE; SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);

  SELECT count(*) INTO n FROM public.admin_actions;
  INSERT INTO r VALUES (2,'creator (the target) reads admin_actions','0 rows', n||' rows');

  -- ===== company: same =====
  RESET ROLE; SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);

  SELECT count(*) INTO n FROM public.admin_actions;
  INSERT INTO r VALUES (3,'company reads admin_actions','0 rows', n||' rows');

  -- ===== anon =====
  RESET ROLE; SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    SELECT count(*) INTO n FROM public.admin_actions;
    INSERT INTO r VALUES (4,'anon reads admin_actions','no access', n||' rows');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (4,'anon reads admin_actions','no access','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  -- ===== no authenticated caller can write here directly =====
  RESET ROLE; SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  BEGIN
    INSERT INTO public.admin_actions (admin_id, target_profile_id, action, old_value, new_value)
    VALUES (adm, a, 'ban', NULL, 'test');
    INSERT INTO r VALUES (5,'admin inserts admin_actions directly (no policy for it)','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (5,'admin inserts admin_actions directly (no policy for it)','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  RESET ROLE;
END
$test$;

SELECT id, test, expected, got,
  CASE WHEN (expected='blocked' AND got LIKE 'blocked:%')
         OR (expected='no access' AND (got LIKE 'blocked:%' OR got='0 rows'))
         OR (expected=got)
       THEN 'PASS' ELSE '*** FAIL ***' END AS verdict
FROM r ORDER BY id;

ROLLBACK;

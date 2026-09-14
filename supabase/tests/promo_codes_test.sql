-- ---------------------------------------------------------------------------
-- Green Light — promo_codes regression test (migration 0013)
--
--   psql "$DATABASE_URL" -f supabase/tests/promo_codes_test.sql
--
-- Two things to prove:
--   1. No role -- admin included -- can read or write promo_codes directly.
--      Every access in the app goes through createAdminClient(), which is
--      the actual Postgres owner role and bypasses RLS entirely, so RLS on
--      this table exists purely to keep `authenticated` locked out.
--   2. The redemption query itself (an atomic conditional UPDATE, not a
--      SELECT-then-UPDATE) really does behave the way redeemCode() in
--      src/app/(app)/settings/actions.ts depends on: a used, expired, or
--      already-claimed code returns zero rows rather than succeeding.
--      This part runs as the table owner (same as the service-role client),
--      since that is the only role that can write here at all -- it is
--      proving the query shape, not that RLS blocks it.
-- ---------------------------------------------------------------------------

BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.local','x',NOW(),NOW()),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@test.local','x',NOW(),NOW());

INSERT INTO public.profiles (id, full_name, role, primary_email) VALUES
  ('11111111-1111-1111-1111-111111111111','Creator A','creator','a@gmail.com'),
  ('33333333-3333-3333-3333-333333333333','The Admin','admin','admin@greenlight.com');

INSERT INTO public.promo_codes (code, duration_days, target_plan, expires_at, created_by) VALUES
  ('LIVE-CODE1', 14, 'Pro',   NOW() + INTERVAL '30 days', '33333333-3333-3333-3333-333333333333'),
  ('USED-CODE1', 30, 'Elite', NOW() + INTERVAL '30 days', '33333333-3333-3333-3333-333333333333'),
  ('OLD-CODE01', 30, 'Pro',   NOW() - INTERVAL '1 day',   '33333333-3333-3333-3333-333333333333');

UPDATE public.promo_codes
SET is_used = true, used_by = '11111111-1111-1111-1111-111111111111', used_at = NOW()
WHERE code = 'USED-CODE1';

CREATE TEMP TABLE r(id int, test text, expected text, got text) ON COMMIT DROP;
GRANT ALL ON TABLE r TO authenticated, anon;

DO $test$
DECLARE
  a   uuid := '11111111-1111-1111-1111-111111111111';
  adm uuid := '33333333-3333-3333-3333-333333333333';
  n int; affected int;
BEGIN
  -- ===== authenticated (creator): no read, no write =====
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);

  BEGIN
    SELECT count(*) INTO n FROM public.promo_codes;
    INSERT INTO r VALUES (1,'creator reads promo_codes','no access', n||' rows');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (1,'creator reads promo_codes','no access','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  -- Row-invisibility case, not a column-privilege one: with no policy at all
  -- for `authenticated`, RLS filters every row out rather than raising, so
  -- this succeeds having changed nothing (see chat_and_violations_test.sql's
  -- note on assertion style) — check ROW_COUNT, don't expect an exception.
  UPDATE public.promo_codes SET is_used = true WHERE code = 'LIVE-CODE1';
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO r VALUES (2,'rows a creator can claim directly','0', affected::text);

  -- ===== authenticated (admin): same -- no policy exists for anyone =====
  RESET ROLE; SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);

  BEGIN
    SELECT count(*) INTO n FROM public.promo_codes;
    INSERT INTO r VALUES (3,'admin reads promo_codes','no access', n||' rows');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (3,'admin reads promo_codes','no access','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  -- ===== anon =====
  RESET ROLE; SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    SELECT count(*) INTO n FROM public.promo_codes;
    INSERT INTO r VALUES (4,'anon reads promo_codes','no access', n||' rows');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (4,'anon reads promo_codes','no access','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  RESET ROLE;

  -- ===== redemption query shape, as the service role would run it =====
  UPDATE public.promo_codes SET is_used = true, used_by = a, used_at = NOW()
  WHERE code = 'LIVE-CODE1' AND is_used = false AND expires_at > NOW();
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO r VALUES (5,'first redemption of a fresh code','1', affected::text);

  UPDATE public.promo_codes SET is_used = true, used_by = a, used_at = NOW()
  WHERE code = 'LIVE-CODE1' AND is_used = false AND expires_at > NOW();
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO r VALUES (6,'second redemption of the same code (the race case)','0', affected::text);

  UPDATE public.promo_codes SET is_used = true, used_by = a, used_at = NOW()
  WHERE code = 'USED-CODE1' AND is_used = false AND expires_at > NOW();
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO r VALUES (7,'redeeming an already-used code','0', affected::text);

  UPDATE public.promo_codes SET is_used = true, used_by = a, used_at = NOW()
  WHERE code = 'OLD-CODE01' AND is_used = false AND expires_at > NOW();
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO r VALUES (8,'redeeming a code past its own expiry','0', affected::text);

  UPDATE public.promo_codes SET is_used = true, used_by = a, used_at = NOW()
  WHERE code = 'NO-SUCH-CODE' AND is_used = false AND expires_at > NOW();
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO r VALUES (9,'redeeming a code that does not exist','0', affected::text);
END
$test$;

SELECT id, test, expected, got,
  CASE WHEN (expected='blocked' AND got LIKE 'blocked:%')
         OR (expected='no access' AND (got LIKE 'blocked:%' OR got='0 rows'))
         OR (expected=got)
       THEN 'PASS' ELSE '*** FAIL ***' END AS verdict
FROM r ORDER BY id;

ROLLBACK;

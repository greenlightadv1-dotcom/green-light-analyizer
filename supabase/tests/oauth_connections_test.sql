-- ---------------------------------------------------------------------------
-- Green Light — oauth_connections regression test (migration 0015)
--
--   psql "$DATABASE_URL" -f supabase/tests/oauth_connections_test.sql
--
-- Same shape as promo_codes_test.sql: this table carries no RLS policy for
-- `authenticated` at all, so every access -- admin included -- goes through
-- createAdminClient(). Nothing here proves the OAuth flow itself works
-- (that needs real credentials and a live provider, neither of which exist
-- in this environment); it proves the one thing the database layer is
-- actually responsible for: these tokens are unreachable from anywhere but
-- the service-role client.
-- ---------------------------------------------------------------------------

BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.local','x',NOW(),NOW()),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@test.local','x',NOW(),NOW());

INSERT INTO public.profiles (id, full_name, role, primary_email) VALUES
  ('11111111-1111-1111-1111-111111111111','Creator A','creator','a@gmail.com'),
  ('33333333-3333-3333-3333-333333333333','The Admin','admin','admin@greenlight.com');

INSERT INTO public.oauth_connections (creator_id, platform, access_token, refresh_token, expires_at, external_account_id)
VALUES ('11111111-1111-1111-1111-111111111111','youtube','fake-access-token','fake-refresh-token',
        NOW() + INTERVAL '1 hour','UC_fake_channel_id');

CREATE TEMP TABLE r(id int, test text, expected text, got text) ON COMMIT DROP;
GRANT ALL ON TABLE r TO authenticated, anon;

DO $test$
DECLARE
  a   uuid := '11111111-1111-1111-1111-111111111111';
  adm uuid := '33333333-3333-3333-3333-333333333333';
  n int; affected int;
BEGIN
  -- ===== the token owner cannot read their own token via authenticated =====
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);

  BEGIN
    SELECT count(*) INTO n FROM public.oauth_connections;
    INSERT INTO r VALUES (1,'token owner reads oauth_connections','no access', n||' rows');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (1,'token owner reads oauth_connections','no access','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  -- Row-invisibility case: a table-wide grant with RLS enabled and no
  -- matching policy filters rows rather than raising -- check ROW_COUNT.
  UPDATE public.oauth_connections SET access_token = 'stolen';
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO r VALUES (2,'rows the token owner can overwrite directly','0', affected::text);

  -- ===== admin: same -- no policy exists for anyone =====
  RESET ROLE; SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);

  BEGIN
    SELECT count(*) INTO n FROM public.oauth_connections;
    INSERT INTO r VALUES (3,'admin reads oauth_connections','no access', n||' rows');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (3,'admin reads oauth_connections','no access','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  BEGIN
    INSERT INTO public.oauth_connections (creator_id, platform, access_token, expires_at)
    VALUES (adm, 'youtube', 'admin-inserted-token', NOW() + INTERVAL '1 hour');
    INSERT INTO r VALUES (4,'admin inserts oauth_connections directly (no policy for it)','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (4,'admin inserts oauth_connections directly (no policy for it)','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  -- ===== anon =====
  RESET ROLE; SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    SELECT count(*) INTO n FROM public.oauth_connections;
    INSERT INTO r VALUES (5,'anon reads oauth_connections','no access', n||' rows');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (5,'anon reads oauth_connections','no access','blocked: '||split_part(SQLERRM,E'\n',1));
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

-- Confirm the token is still intact after all of the above.
SELECT access_token, 'must equal fake-access-token' AS note
FROM public.oauth_connections WHERE creator_id = '11111111-1111-1111-1111-111111111111';

ROLLBACK;

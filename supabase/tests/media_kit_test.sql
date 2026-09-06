-- ---------------------------------------------------------------------------
-- Green Light — Media Kit regression test (§7)
--
-- The point of this suite is the verified/declared boundary. §1 and §7.2 stake
-- the product on "nothing is shown as verified unless it came from an API", and
-- that claim is only worth anything if a creator physically cannot write the
-- verified columns. Tests 2-5 are that claim, asserted against the database
-- rather than against the code that is supposed to avoid writing them.
--
--   psql "$DATABASE_URL" -f supabase/tests/media_kit_test.sql
--
-- Assertion style, as in chat_and_violations_test.sql: exceptions for column
-- privileges (which raise), ROW_COUNT for anything RLS hides (which does not).
-- ---------------------------------------------------------------------------

BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.local','x',NOW(),NOW()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.local','x',NOW(),NOW());

INSERT INTO public.profiles (id, full_name, role, primary_email, subscription_plan) VALUES
  ('11111111-1111-1111-1111-111111111111','Creator A','creator','a@gmail.com','Pro'),
  ('22222222-2222-2222-2222-222222222222','Creator B','creator','b@gmail.com','Starter');

-- A verified YouTube kit, shaped as the OAuth sync would have written it.
-- Note the declared and verified geographies disagree: that is deliberate, so
-- the disconnect test can prove which one is cleared and which one survives.
INSERT INTO public.media_kits
  (id, creator_id, platform, platform_handle, avg_views, engagement_rate, content_category,
   declared_top_countries, verified_top_countries, audience_verified, analytics_oauth_connected)
VALUES
  ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','youtube','@a',
   50000, 4.2, 'gaming',
   '[{"country":"EG","pct":90}]'::jsonb,
   '[{"country":"EG","pct":45},{"country":"SA","pct":30}]'::jsonb,
   TRUE, TRUE);

CREATE TEMP TABLE r(id int, test text, expected text, got text) ON COMMIT DROP;
GRANT ALL ON TABLE r TO authenticated, anon;

DO $t$
DECLARE
  a uuid := '11111111-1111-1111-1111-111111111111';
  b uuid := '22222222-2222-2222-2222-222222222222';
  n int; affected int; flag boolean; vtc jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);

  -- Self-reported fields are the creator's to write (§7.1).
  BEGIN
    UPDATE public.media_kits SET declared_top_countries = '[{"country":"EG","pct":50}]'::jsonb,
      avg_views = 60000, platform_handle = '@a-new' WHERE creator_id = a;
    INSERT INTO r VALUES (1,'A edits own declared stats + handle','allowed','allowed');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (1,'A edits own declared stats + handle','allowed','BLOCKED: '||split_part(SQLERRM,E'\n',1));
  END;

  -- The verified ones are not, at any price (§7.2). This is the anti-fraud claim.
  BEGIN
    UPDATE public.media_kits SET audience_verified = TRUE WHERE creator_id = a;
    INSERT INTO r VALUES (2,'A sets audience_verified','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (2,'A sets audience_verified','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  BEGIN
    UPDATE public.media_kits SET verified_top_countries = '[{"country":"US","pct":99}]'::jsonb WHERE creator_id = a;
    INSERT INTO r VALUES (3,'A writes verified_top_countries','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (3,'A writes verified_top_countries','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  BEGIN
    UPDATE public.media_kits SET analytics_oauth_connected = TRUE WHERE creator_id = a;
    INSERT INTO r VALUES (4,'A sets analytics_oauth_connected','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (4,'A sets analytics_oauth_connected','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  -- The update path is not the only way in: a fresh row must not arrive verified.
  BEGIN
    INSERT INTO public.media_kits (creator_id, platform, audience_verified)
    VALUES (a, 'twitch', TRUE);
    INSERT INTO r VALUES (5,'A inserts a kit pre-marked verified','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (5,'A inserts a kit pre-marked verified','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  -- 0007: one kit per creator per platform.
  BEGIN
    INSERT INTO public.media_kits (creator_id, platform) VALUES (a, 'youtube');
    INSERT INTO r VALUES (6,'A adds a second YouTube kit','blocked','ALLOWED');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (6,'A adds a second YouTube kit','blocked','blocked: '||split_part(SQLERRM,E'\n',1));
  END;

  -- ===== another creator =====
  RESET ROLE; SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);

  SELECT count(*) INTO n FROM public.media_kits;
  INSERT INTO r VALUES (7,'B reads A media kit','0 rows', n||' rows');

  UPDATE public.media_kits SET avg_views = 1 WHERE creator_id = a;
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO r VALUES (8,'rows B can edit on A kit','0', affected::text);

  -- ===== §12 disconnect, exactly as disconnectAnalytics() performs it =====
  RESET ROLE;
  UPDATE public.media_kits
    SET audience_verified = FALSE, verified_top_countries = NULL, analytics_oauth_connected = FALSE
    WHERE creator_id = a AND platform = 'youtube';

  SELECT audience_verified, verified_top_countries INTO flag, vtc
  FROM public.media_kits WHERE creator_id = a AND platform = 'youtube';

  INSERT INTO r VALUES (9,'§12 disconnect clears the verified flag','false', flag::text);
  INSERT INTO r VALUES (10,'§12 disconnect clears verified geography','null', COALESCE(vtc::text,'null'));

  -- The creator's own self-reported data was never the API's to take away.
  SELECT (declared_top_countries IS NOT NULL) INTO flag
  FROM public.media_kits WHERE creator_id = a AND platform = 'youtube';
  INSERT INTO r VALUES (11,'declared geography survives disconnect','true', flag::text);

  RESET ROLE; SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    SELECT count(*) INTO n FROM public.media_kits;
    INSERT INTO r VALUES (12,'anon reads media kits','no access', n||' rows');
  EXCEPTION WHEN others THEN
    INSERT INTO r VALUES (12,'anon reads media kits','no access','blocked: '||split_part(SQLERRM,E'\n',1));
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

-- ---------------------------------------------------------------------------
-- 0025 media_kit_snapshots — access-control regression test.
--
--   psql "$DATABASE_URL" -f supabase/tests/media_kit_snapshots_test.sql
--
-- Runs inside a transaction and rolls back. Simulates PostgREST callers with
-- SET LOCAL ROLE + request.jwt.claims, like the other files in this folder.
-- RLS hides rows rather than refusing, so reads are checked by row count and
-- writes by the "permission denied" that table privileges raise.
-- ---------------------------------------------------------------------------
BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('a1111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c1@test.local','x',NOW(),NOW()),
  ('a2222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c2@test.local','x',NOW(),NOW()),
  ('a3333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','co@test.local','x',NOW(),NOW()),
  ('a4444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ad@test.local','x',NOW(),NOW());

INSERT INTO public.profiles (id, full_name, role, primary_email) VALUES
  ('a1111111-1111-1111-1111-111111111111','Creator One','creator','c1@test.local'),
  ('a2222222-2222-2222-2222-222222222222','Creator Two','creator','c2@test.local'),
  ('a3333333-3333-3333-3333-333333333333','Company','company','co@test.local'),
  ('a4444444-4444-4444-4444-444444444444','Admin','admin','ad@test.local');

INSERT INTO public.media_kits (id, creator_id, platform) VALUES
  ('b1111111-1111-1111-1111-111111111111','a1111111-1111-1111-1111-111111111111','youtube'),
  ('b2222222-2222-2222-2222-222222222222','a2222222-2222-2222-2222-222222222222','youtube');

-- The server (service role) is the writer.
SET LOCAL ROLE service_role;
INSERT INTO public.media_kit_snapshots (media_kit_id, creator_id, platform, source, captured_on, subscriber_count) VALUES
  ('b1111111-1111-1111-1111-111111111111','a1111111-1111-1111-1111-111111111111','youtube','youtube_data_api', CURRENT_DATE - 7, 1000),
  ('b1111111-1111-1111-1111-111111111111','a1111111-1111-1111-1111-111111111111','youtube','youtube_data_api', CURRENT_DATE, 1100),
  ('b2222222-2222-2222-2222-222222222222','a2222222-2222-2222-2222-222222222222','youtube','youtube_data_api', CURRENT_DATE, 50);
RESET ROLE;

DO $$
DECLARE n int;
BEGIN
  -- One per kit per day.
  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.media_kit_snapshots (media_kit_id, creator_id, platform, source, captured_on)
    VALUES ('b1111111-1111-1111-1111-111111111111','a1111111-1111-1111-1111-111111111111','youtube','youtube_data_api', CURRENT_DATE);
    RAISE EXCEPTION 'FAIL: a second snapshot on the same day was accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS one snapshot per kit per day';
  END;
  RESET ROLE;

  -- Only official API sources.
  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.media_kit_snapshots (media_kit_id, creator_id, platform, source)
    VALUES ('b2222222-2222-2222-2222-222222222222','a2222222-2222-2222-2222-222222222222','youtube','self_reported');
    RAISE EXCEPTION 'FAIL: a self-reported snapshot was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS source must be an official API';
  END;
  RESET ROLE;

  -- Creator One sees only their own two rows.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.media_kit_snapshots;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: creator saw % rows, expected 2', n; END IF;
  RAISE NOTICE 'PASS creator reads only own snapshots';

  -- A creator cannot write, even their own rows.
  BEGIN
    INSERT INTO public.media_kit_snapshots (media_kit_id, creator_id, platform, source)
    VALUES ('b1111111-1111-1111-1111-111111111111','a1111111-1111-1111-1111-111111111111','youtube','youtube_data_api');
    RAISE EXCEPTION 'FAIL: creator inserted a snapshot';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS creator cannot insert';
  END;
  BEGIN
    UPDATE public.media_kit_snapshots SET subscriber_count = 999999;
    RAISE EXCEPTION 'FAIL: creator updated a snapshot';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS creator cannot update';
  END;
  BEGIN
    DELETE FROM public.media_kit_snapshots;
    RAISE EXCEPTION 'FAIL: creator deleted snapshots';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS creator cannot delete';
  END;
  RESET ROLE;

  -- A company sees none.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.media_kit_snapshots;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: company saw % rows', n; END IF;
  RAISE NOTICE 'PASS company reads no snapshots';
  RESET ROLE;

  -- An admin sees all.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.media_kit_snapshots;
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL: admin saw % rows, expected 3', n; END IF;
  RAISE NOTICE 'PASS admin reads all snapshots';
  RESET ROLE;

  -- Anonymous: no privilege at all.
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO n FROM public.media_kit_snapshots;
    RAISE EXCEPTION 'FAIL: anon read snapshots';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS anon cannot read';
  END;
  RESET ROLE;

  -- Deleting a media kit removes its history.
  DELETE FROM public.media_kits WHERE id = 'b2222222-2222-2222-2222-222222222222';
  SELECT count(*) INTO n FROM public.media_kit_snapshots WHERE media_kit_id = 'b2222222-2222-2222-2222-222222222222';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: snapshots survived their media kit'; END IF;
  RAISE NOTICE 'PASS snapshots cascade with their media kit';
END $$;

ROLLBACK;

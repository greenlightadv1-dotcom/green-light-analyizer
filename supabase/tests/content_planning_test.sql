-- ---------------------------------------------------------------------------
-- 0029 content planning — ownership, checks and RLS.
--
--   psql "$DATABASE_URL" -f supabase/tests/content_planning_test.sql
--
-- Runs in a transaction and rolls back.
-- ---------------------------------------------------------------------------
BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('a7000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ccr1@t.local','x',NOW(),NOW()),
  ('a7000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ccr2@t.local','x',NOW(),NOW()),
  ('a8000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cco1@t.local','x',NOW(),NOW()),
  ('a9000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cad@t.local','x',NOW(),NOW());
INSERT INTO public.profiles (id, full_name, role, primary_email) VALUES
  ('a7000000-0000-0000-0000-000000000001','C Creator One','creator','ccr1@t.local'),
  ('a7000000-0000-0000-0000-000000000002','C Creator Two','creator','ccr2@t.local'),
  ('a8000000-0000-0000-0000-000000000001','C Company','company','cco1@t.local'),
  ('a9000000-0000-0000-0000-000000000001','C Admin','admin','cad@t.local');

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_like text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE p_like THEN RAISE NOTICE 'PASS refused: %', SQLERRM; RETURN; END IF;
    RAISE EXCEPTION 'FAIL: % raised "%", expected %', p_sql, SQLERRM, p_like;
  END;
  RAISE EXCEPTION 'FAIL: % succeeded, expected an error', p_sql;
END $$;

DO $$
DECLARE n int; br uuid; inv uuid; col uuid; r record;
  cr1 uuid := 'a7000000-0000-0000-0000-000000000001';
  cr2 uuid := 'a7000000-0000-0000-0000-000000000002';
  co uuid := 'a8000000-0000-0000-0000-000000000001';
  ad uuid := 'a9000000-0000-0000-0000-000000000001';
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.briefs (company_id, title, description, status, published_at)
    VALUES (co, 'Content test brief', 'Brief for the content planning test.', 'published', now()) RETURNING id INTO br;
  inv := public.collab_create_invitation(co, br, cr1, 'Join us', null);
  col := public.collab_respond_invitation(cr1, inv, 'accept', null);

  INSERT INTO public.content_items (creator_id, kind, title, body, status, planned_for, collaboration_id)
    VALUES (cr1, 'script', 'Launch script', 'Intro, demo, call to action.', 'scheduled', '2026-11-20', col);
  INSERT INTO public.content_items (creator_id, kind, title) VALUES (cr1, 'idea', 'Behind the scenes');
  PERFORM pg_temp.expect_error(format('insert into public.content_items (creator_id, kind, title) values (%L, %L, %L)', co, 'idea', 'Company idea'), 'content:not_creator%');
  PERFORM pg_temp.expect_error(format('insert into public.content_items (creator_id, kind, title, collaboration_id) values (%L, %L, %L, %L)', cr2, 'script', 'Not mine', col), 'content:collaboration%');
  PERFORM pg_temp.expect_error(format('insert into public.content_items (creator_id, kind, title, status) values (%L, %L, %L, %L)', cr1, 'idea', 'No date', 'scheduled'), '%content_scheduled_has_date%');
  PERFORM pg_temp.expect_error(format('insert into public.content_items (creator_id, kind, title) values (%L, %L, %L)', cr1, 'podcast', 'Bad kind'), '%check%');
  RAISE NOTICE 'PASS content ownership and checks';
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', cr1), true);
  SELECT count(*) INTO n FROM public.content_items;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: owner sees % items', n; END IF;
  PERFORM pg_temp.expect_error(format('update public.content_items set title = %L where creator_id = %L', 'x', cr1), '%permission denied%');
  PERFORM pg_temp.expect_error(format('insert into public.content_items (creator_id, kind, title) values (%L, %L, %L)', cr1, 'idea', 'Direct'), '%permission denied%');
  FOR r IN SELECT unnest(array[cr2, co, ad]) AS who LOOP
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', r.who), true);
    SELECT count(*) INTO n FROM public.content_items;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL: % reads another creator''s content', r.who; END IF;
  END LOOP;
  RESET ROLE;
  SET LOCAL ROLE anon;
  PERFORM pg_temp.expect_error('select count(*) from public.content_items', '%permission denied%');
  RESET ROLE;
  RAISE NOTICE 'PASS content is owner-only';
END $$;

ROLLBACK;

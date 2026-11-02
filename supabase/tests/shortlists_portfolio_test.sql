-- ---------------------------------------------------------------------------
-- 0028 shortlists, portfolio and public-profile visibility.
--
--   psql "$DATABASE_URL" -f supabase/tests/shortlists_portfolio_test.sql
--
-- Runs in a transaction and rolls back.
-- ---------------------------------------------------------------------------
BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('f1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pcr1@t.local','x',NOW(),NOW()),
  ('f1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pcr2@t.local','x',NOW(),NOW()),
  ('f2000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pco1@t.local','x',NOW(),NOW()),
  ('f2000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pco2@t.local','x',NOW(),NOW()),
  ('f3000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pad@t.local','x',NOW(),NOW());
INSERT INTO public.profiles (id, full_name, role, primary_email, bio, country, base_rate_usd, shareable_slug) VALUES
  ('f1000000-0000-0000-0000-000000000001','P Creator One','creator','pcr1@t.local','My bio','EG',300,'p-creator-one'),
  ('f1000000-0000-0000-0000-000000000002','P Creator Two','creator','pcr2@t.local','Other bio','SA',200,'p-creator-two'),
  ('f2000000-0000-0000-0000-000000000001','P Company One','company','pco1@t.local',null,null,null,null),
  ('f2000000-0000-0000-0000-000000000002','P Company Two','company','pco2@t.local',null,null,null,null),
  ('f3000000-0000-0000-0000-000000000001','P Admin','admin','pad@t.local',null,null,null,null);

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
DECLARE n int; r record; sl uuid;
  cr1 uuid := 'f1000000-0000-0000-0000-000000000001';
  cr2 uuid := 'f1000000-0000-0000-0000-000000000002';
  co1 uuid := 'f2000000-0000-0000-0000-000000000001';
  co2 uuid := 'f2000000-0000-0000-0000-000000000002';
  ad uuid := 'f3000000-0000-0000-0000-000000000001';
BEGIN
  SET LOCAL ROLE service_role;

  -- Shortlists: companies only; entries must be creators.
  INSERT INTO public.shortlists (company_id, name) VALUES (co1, 'Tech reviewers') RETURNING id INTO sl;
  PERFORM pg_temp.expect_error(format('insert into public.shortlists (company_id, name) values (%L, %L)', cr1, 'Mine'), 'shortlist:not_company%');
  PERFORM pg_temp.expect_error(format('insert into public.shortlists (company_id, name) values (%L, %L)', co1, '   '), '%check%');
  PERFORM pg_temp.expect_error(format('insert into public.shortlists (company_id, name) values (%L, %L)', co1, 'Tech reviewers'), '%shortlists_unique_name%');
  INSERT INTO public.shortlist_entries (shortlist_id, creator_id, note) VALUES (sl, cr1, 'Great fit');
  PERFORM pg_temp.expect_error(format('insert into public.shortlist_entries (shortlist_id, creator_id) values (%L, %L)', sl, co2), 'shortlist:not_creator%');
  PERFORM pg_temp.expect_error(format('insert into public.shortlist_entries (shortlist_id, creator_id) values (%L, %L)', sl, cr1), '%duplicate key%');
  FOR n IN 2..20 LOOP INSERT INTO public.shortlists (company_id, name) VALUES (co1, 'List ' || n); END LOOP;
  PERFORM pg_temp.expect_error(format('insert into public.shortlists (company_id, name) values (%L, %L)', co1, 'One too many'), 'shortlist:too_many%');
  RAISE NOTICE 'PASS shortlist ownership, membership and limits';

  -- Portfolio: creators only; brand consent; limit.
  INSERT INTO public.portfolio_items (creator_id, title, url, brand_name, brand_name_public, is_public, sort_order)
    VALUES (cr1, 'Launch review', 'https://example.com/v1', 'Nimbus', true, true, 1);
  INSERT INTO public.portfolio_items (creator_id, title, brand_name, brand_name_public, is_public, sort_order)
    VALUES (cr1, 'Unnamed brand spot', 'Secret Co', false, true, 2);
  INSERT INTO public.portfolio_items (creator_id, title, is_public, sort_order) VALUES (cr1, 'Private draft', false, 3);
  PERFORM pg_temp.expect_error(format('insert into public.portfolio_items (creator_id, title) values (%L, %L)', co1, 'Not a creator'), 'portfolio:not_creator%');
  PERFORM pg_temp.expect_error(format('insert into public.portfolio_items (creator_id, title, url) values (%L, %L, %L)', cr1, 'Bad link', 'http://example.com'), '%check%');
  PERFORM pg_temp.expect_error(format('insert into public.portfolio_items (creator_id, title, brand_name_public) values (%L, %L, true)', cr1, 'Consent without brand'), '%portfolio_brand_consent%');
  FOR n IN 4..30 LOOP INSERT INTO public.portfolio_items (creator_id, title) VALUES (cr1, 'Item ' || n); END LOOP;
  PERFORM pg_temp.expect_error(format('insert into public.portfolio_items (creator_id, title) values (%L, %L)', cr1, 'Thirty-one'), 'portfolio:too_many%');
  RAISE NOTICE 'PASS portfolio ownership, https, consent and limits';
  RESET ROLE;

  -- Public RPCs: before any settings row, the profile is unchanged and the portfolio is off.
  SET LOCAL ROLE anon;
  SELECT * INTO r FROM public.creator_public_profile('p-creator-one');
  IF r.bio IS DISTINCT FROM 'My bio' OR r.base_rate_usd IS DISTINCT FROM 300 OR r.country IS DISTINCT FROM 'EG' THEN
    RAISE EXCEPTION 'FAIL: default public profile changed: %', r;
  END IF;
  SELECT count(*) INTO n FROM public.creator_public_portfolio('p-creator-one');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: portfolio public by default'; END IF;
  RESET ROLE;

  SET LOCAL ROLE service_role;
  INSERT INTO public.public_profile_settings (profile_id, show_bio, show_rate, show_portfolio) VALUES (cr1, false, false, true);
  RESET ROLE;

  SET LOCAL ROLE anon;
  SELECT * INTO r FROM public.creator_public_profile('p-creator-one');
  IF r.bio IS NOT NULL OR r.base_rate_usd IS NOT NULL OR r.country IS DISTINCT FROM 'EG' OR r.full_name <> 'P Creator One' THEN
    RAISE EXCEPTION 'FAIL: hidden sections leaked: %', r;
  END IF;
  SELECT count(*) INTO n FROM public.creator_public_portfolio('p-creator-one');
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: expected 2 public items, got %', n; END IF;
  SELECT count(*) INTO n FROM public.creator_public_portfolio('p-creator-one') WHERE brand_name = 'Secret Co';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: brand named without consent'; END IF;
  SELECT count(*) INTO n FROM public.creator_public_portfolio('p-creator-one') WHERE brand_name = 'Nimbus';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: consented brand missing'; END IF;
  SELECT count(*) INTO n FROM public.creator_public_portfolio('p-creator-one') WHERE title = 'Private draft';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: private item public'; END IF;
  PERFORM pg_temp.expect_error('select count(*) from public.portfolio_items', '%permission denied%');
  PERFORM pg_temp.expect_error('select count(*) from public.shortlists', '%permission denied%');
  RESET ROLE;
  RAISE NOTICE 'PASS public RPCs honour visibility and consent';

  -- RLS: shortlists are company-private; creators never see them.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', co1), true);
  SELECT count(*) INTO n FROM public.shortlist_entries;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: owner sees % entries', n; END IF;
  PERFORM pg_temp.expect_error(format('insert into public.shortlists (company_id, name) values (%L, %L)', co1, 'Direct'), '%permission denied%');
  PERFORM pg_temp.expect_error(format('delete from public.shortlist_entries where creator_id = %L', cr1), '%permission denied%');

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', co2), true);
  SELECT count(*) INTO n FROM public.shortlists;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: another company sees shortlists'; END IF;

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', cr1), true);
  SELECT count(*) INTO n FROM public.shortlist_entries;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: creator sees that they were shortlisted'; END IF;
  SELECT count(*) INTO n FROM public.portfolio_items;
  IF n <> 30 THEN RAISE EXCEPTION 'FAIL: creator sees % own items', n; END IF;
  PERFORM pg_temp.expect_error(format('update public.portfolio_items set is_public = true where creator_id = %L', cr1), '%permission denied%');
  PERFORM pg_temp.expect_error(format('update public.public_profile_settings set show_bio = true where profile_id = %L', cr1), '%permission denied%');

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', cr2), true);
  SELECT count(*) INTO n FROM public.portfolio_items;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: another creator reads a portfolio'; END IF;
  SELECT count(*) INTO n FROM public.public_profile_settings;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: another creator reads settings'; END IF;

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', ad), true);
  SELECT count(*) INTO n FROM public.portfolio_items;
  IF n <> 30 THEN RAISE EXCEPTION 'FAIL: admin cannot review portfolios'; END IF;
  SELECT count(*) INTO n FROM public.shortlists;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: admin reads company shortlists'; END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS RLS for shortlists, portfolio and settings';

  -- A banned creator disappears from both public RPCs.
  UPDATE public.profiles SET banned_at = now() WHERE id = cr1;
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.creator_public_portfolio('p-creator-one');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: banned creator portfolio public'; END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS banned creators are hidden';
END $$;

ROLLBACK;

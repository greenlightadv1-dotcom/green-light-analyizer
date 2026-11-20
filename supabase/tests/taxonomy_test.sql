-- 0033: seeded taxonomy, parent rules, reference checks, deactivate-not-delete, grants.
BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('f1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','tx@t.local','x',NOW(),NOW());
INSERT INTO public.profiles (id, full_name, role, primary_email) VALUES
  ('f1000000-0000-0000-0000-000000000001','Tax Creator','creator','tx@t.local');

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_like text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE p_like THEN RAISE NOTICE 'PASS refused: %', SQLERRM; RETURN; END IF;
    RAISE EXCEPTION 'FAIL: % raised "%", expected %', p_sql, SQLERRM, p_like;
  END;
  RAISE EXCEPTION 'FAIL: % succeeded, expected %', p_sql, p_like;
END $$;

DO $$
DECLARE n int; s text; cr uuid := 'f1000000-0000-0000-0000-000000000001';
BEGIN
  -- Every id the code list knows is seeded, so stored selections stay valid.
  SELECT count(*) INTO n FROM public.taxonomy_terms WHERE kind = 'category'; IF n <> 13 THEN RAISE EXCEPTION 'FAIL: % categories', n; END IF;
  SELECT count(*) INTO n FROM public.taxonomy_terms WHERE kind = 'game'; IF n <> 19 THEN RAISE EXCEPTION 'FAIL: % games', n; END IF;
  SELECT count(*) INTO n FROM public.taxonomy_terms WHERE kind = 'format'; IF n <> 8 THEN RAISE EXCEPTION 'FAIL: % formats', n; END IF;
  SELECT count(*) INTO n FROM public.taxonomy_terms WHERE kind = 'game' AND parent_id IS NULL; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: unparented games'; END IF;
  SELECT count(*) INTO n FROM public.taxonomy_terms WHERE btrim(label_ar) = ''; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: missing Arabic labels'; END IF;
  RAISE NOTICE 'PASS seed matches the code list';

  SET LOCAL ROLE service_role;
  -- Parent rules and cycles.
  PERFORM pg_temp.expect_error('insert into public.taxonomy_terms (id, kind, parent_id, label_en, label_ar) values (''bad_game'', ''game'', ''live_stream'', ''x'', ''x'')', 'taxonomy:parent_kind%');
  PERFORM pg_temp.expect_error('insert into public.taxonomy_terms (id, kind, parent_id, label_en, label_ar) values (''orphan'', ''genre'', ''nope'', ''x'', ''x'')', 'taxonomy:parent_missing%');
  PERFORM pg_temp.expect_error('insert into public.taxonomy_terms (id, kind, label_en, label_ar) values (''Bad Id'', ''sport'', ''x'', ''x'')', '%check%');
  INSERT INTO public.taxonomy_terms (id, kind, label_en, label_ar) VALUES ('sports', 'category', 'Sports', 'رياضة');
  INSERT INTO public.taxonomy_terms (id, kind, parent_id, label_en, label_ar) VALUES ('sport_football', 'sport', 'sports', 'Football', 'كرة القدم');
  PERFORM pg_temp.expect_error('update public.taxonomy_terms set kind = ''interest'' where id = ''sport_football''', 'taxonomy:kind_frozen%');
  PERFORM pg_temp.expect_error('update public.taxonomy_terms set parent_id = ''sport_football'' where id = ''sports''', 'taxonomy:parent_kind%');
  RAISE NOTICE 'PASS parent kinds, ids and frozen kind';

  -- Reference checks on profiles.
  UPDATE public.profiles SET creator_categories = '{gaming,sports}', creator_games = '{valorant}', creator_tags = '{sport_football}' WHERE id = cr;
  PERFORM pg_temp.expect_error(format('update public.profiles set creator_categories = %L where id = %L', '{gaming,made_up}', cr), 'taxonomy:unknown_term%');
  PERFORM pg_temp.expect_error(format('update public.profiles set creator_games = %L where id = %L', '{gaming}', cr), 'taxonomy:unknown_term%');
  PERFORM pg_temp.expect_error(format('update public.profiles set creator_tags = %L where id = %L', '{valorant}', cr), 'taxonomy:unknown_term%');
  -- Deactivating keeps existing selections valid but refuses new ones.
  UPDATE public.taxonomy_terms SET active = false WHERE id IN ('sport_football', 'dota2');
  UPDATE public.profiles SET creator_categories = '{gaming,sports,tech}' WHERE id = cr;
  SELECT array_to_string(creator_tags, ',') INTO s FROM public.profiles WHERE id = cr;
  IF s <> 'sport_football' THEN RAISE EXCEPTION 'FAIL: deactivation changed stored data (%)', s; END IF;
  PERFORM pg_temp.expect_error(format('update public.profiles set creator_games = %L where id = %L', '{valorant,dota2}', cr), 'taxonomy:unknown_term%');
  RAISE NOTICE 'PASS references checked; deactivation never breaks stored data';

  -- Delete only what nothing uses.
  PERFORM pg_temp.expect_error('select public.taxonomy_delete(''sport_football'')', 'taxonomy:in_use%');
  PERFORM pg_temp.expect_error('select public.taxonomy_delete(''sports'')', 'taxonomy:in_use%');
  PERFORM pg_temp.expect_error('select public.taxonomy_delete(''gaming'')', 'taxonomy:in_use%');
  INSERT INTO public.taxonomy_terms (id, kind, parent_id, label_en, label_ar) VALUES ('sport_padel', 'sport', 'sports', 'Padel', 'بادل');
  PERFORM public.taxonomy_delete('sport_padel');
  SELECT count(*) INTO n FROM public.taxonomy_terms WHERE id = 'sport_padel'; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: unused term not deleted'; END IF;
  RAISE NOTICE 'PASS delete refused while referenced';
  RESET ROLE;

  -- Anyone reads the catalogue; no client writes.
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.taxonomy_terms; IF n < 40 THEN RAISE EXCEPTION 'FAIL: anon reads % terms', n; END IF;
  PERFORM pg_temp.expect_error('insert into public.taxonomy_terms (id, kind, label_en, label_ar) values (''hack'', ''sport'', ''x'', ''x'')', '%permission denied%');
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', cr), true);
  PERFORM pg_temp.expect_error('update public.taxonomy_terms set label_en = ''x'' where id = ''gaming''', '%permission denied%');
  PERFORM pg_temp.expect_error('select public.taxonomy_delete(''tech'')', '%permission denied%');
  PERFORM pg_temp.expect_error(format('update public.profiles set creator_tags = %L where id = %L', '{}', cr), '%permission denied%');
  RESET ROLE;
  RAISE NOTICE 'PASS grants';
END $$;
ROLLBACK;

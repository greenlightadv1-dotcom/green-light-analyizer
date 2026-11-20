-- 0035: owner/admin read only, server-only writes, hidden counts stay NULL.
BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('b6000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','v1@t.local','x',NOW(),NOW()),
  ('b6000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','v2@t.local','x',NOW(),NOW()),
  ('b6000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','v3@t.local','x',NOW(),NOW());
INSERT INTO public.profiles (id, full_name, role, primary_email) VALUES
  ('b6000000-0000-0000-0000-000000000001','Vid Creator','creator','v1@t.local'),
  ('b6000000-0000-0000-0000-000000000002','Other Creator','creator','v2@t.local'),
  ('b6000000-0000-0000-0000-000000000003','A Company','company','v3@t.local');
INSERT INTO public.media_kits (id, creator_id, platform) VALUES ('b6100000-0000-0000-0000-000000000001','b6000000-0000-0000-0000-000000000001','youtube');

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
DECLARE n int;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.media_kit_videos (media_kit_id, creator_id, video_id, title, published_at, view_count, like_count, comment_count)
  VALUES ('b6100000-0000-0000-0000-000000000001','b6000000-0000-0000-0000-000000000001','abcDEF12345','One', now() - interval '3 days', 1000, NULL, 5);
  PERFORM pg_temp.expect_error('insert into public.media_kit_videos (media_kit_id, creator_id, video_id) values (''b6100000-0000-0000-0000-000000000001'',''b6000000-0000-0000-0000-000000000001'',''bad id!'')', '%check%');
  PERFORM pg_temp.expect_error('insert into public.media_kit_videos (media_kit_id, creator_id, video_id, view_count) values (''b6100000-0000-0000-0000-000000000001'',''b6000000-0000-0000-0000-000000000001'',''zzzZZZ99999'', -1)', '%check%');
  SELECT count(*) INTO n FROM public.media_kit_videos WHERE like_count IS NULL; IF n <> 1 THEN RAISE EXCEPTION 'FAIL: hidden likes not kept as NULL'; END IF;
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"b6000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.media_kit_videos; IF n <> 1 THEN RAISE EXCEPTION 'FAIL: owner reads %', n; END IF;
  PERFORM pg_temp.expect_error('delete from public.media_kit_videos', '%permission denied%');
  PERFORM set_config('request.jwt.claims', '{"sub":"b6000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.media_kit_videos; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: another creator reads videos'; END IF;
  PERFORM set_config('request.jwt.claims', '{"sub":"b6000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.media_kit_videos; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a company reads videos'; END IF;
  RESET ROLE;
  SET LOCAL ROLE anon;
  PERFORM pg_temp.expect_error('select count(*) from public.media_kit_videos', '%permission denied%');
  RESET ROLE;
  RAISE NOTICE 'PASS owner-only reads, server-only writes, NULL for hidden counts';
END $$;
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 0027 notifications — trigger, preferences and access test.
--
--   psql "$DATABASE_URL" -f supabase/tests/notifications_test.sql
--
-- Runs in a transaction and rolls back.
-- ---------------------------------------------------------------------------
BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('d1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ncr1@t.local','x',NOW(),NOW()),
  ('d1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ncr2@t.local','x',NOW(),NOW()),
  ('d2000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','nco1@t.local','x',NOW(),NOW()),
  ('d3000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','nad@t.local','x',NOW(),NOW());
INSERT INTO public.profiles (id, full_name, role, primary_email) VALUES
  ('d1000000-0000-0000-0000-000000000001','N Creator One','creator','ncr1@t.local'),
  ('d1000000-0000-0000-0000-000000000002','N Creator Two','creator','ncr2@t.local'),
  ('d2000000-0000-0000-0000-000000000001','N Company One','company','nco1@t.local'),
  ('d3000000-0000-0000-0000-000000000001','N Admin','admin','nad@t.local');

SET LOCAL ROLE service_role;
INSERT INTO public.briefs (id, company_id, title, description, status, published_at) VALUES
  ('e0000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','Notify brief','A brief used by the notification test.','published', now());
RESET ROLE;

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
DECLARE n int; k text;
  co uuid := 'd2000000-0000-0000-0000-000000000001';
  cr uuid := 'd1000000-0000-0000-0000-000000000001';
  cr2 uuid := 'd1000000-0000-0000-0000-000000000002';
  ad uuid := 'd3000000-0000-0000-0000-000000000001';
  br uuid := 'e0000000-0000-0000-0000-000000000001';
  inv uuid; inv2 uuid; col uuid; del uuid;
BEGIN
  SET LOCAL ROLE service_role;

  -- The invited creator is notified; the acting company is not.
  inv := public.collab_create_invitation(co, br, cr, 'Please review our app.', 400);
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_id = cr AND kind = 'invitation_sent' AND invitation_id = inv AND brief_id = br;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: creator has % invitation notifications', n; END IF;
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_id = co;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: the actor was notified'; END IF;
  RAISE NOTICE 'PASS invitation notifies the creator only';

  -- Accepting notifies the company; the notification carries the collaboration.
  col := public.collab_respond_invitation(cr, inv, 'accept', null);
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_id = co AND kind = 'invitation_accepted';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: company not notified of acceptance'; END IF;
  RAISE NOTICE 'PASS acceptance notifies the company';

  -- Muting a category stops it, and only it.
  INSERT INTO public.notification_preferences (profile_id, muted_categories) VALUES (co, array['terms']);
  PERFORM public.collab_propose_terms(cr, col, 450, 'One integration, 30-day usage.');
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_id = co AND category = 'terms';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: muted category delivered'; END IF;
  PERFORM public.collab_add_deliverable(co, col, 'Video', null, null);
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_id = cr AND kind = 'deliverable_added' AND collaboration_id = col;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: deliverable notification missing'; END IF;
  RAISE NOTICE 'PASS muting suppresses only the muted category';

  -- Preferences outside the allowed set are refused.
  PERFORM pg_temp.expect_error(format('update public.notification_preferences set muted_categories = array[%L] where profile_id = %L', 'marketing', co), '%muted_categories%');

  -- No free text is stored: the table has no text column beyond kind/category.
  SELECT string_agg(column_name, ',') INTO k FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'notifications' AND data_type = 'text';
  IF k <> 'kind,category' AND k <> 'category,kind' THEN RAISE EXCEPTION 'FAIL: unexpected text columns %', k; END IF;
  RAISE NOTICE 'PASS notifications hold no free text';

  -- The server may mark read, but may not create or rewrite a notification.
  UPDATE public.notifications SET read_at = now() WHERE recipient_id = cr;
  PERFORM pg_temp.expect_error(format('insert into public.notifications (recipient_id, event_id, kind, category) values (%L, 1, %L, %L)', cr, 'invitation_sent', 'invitations'), '%permission denied%');
  PERFORM pg_temp.expect_error(format('update public.notifications set kind = %L where recipient_id = %L', 'terms_agreed', cr), '%permission denied%');

  -- A second invitation to another creator: their notification is theirs alone.
  inv2 := public.collab_create_invitation(co, br, cr2, 'Second creator.', null);
  RESET ROLE;

  -- RLS: each person sees only their own rows.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', cr), true);
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_id <> cr;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: creator reads others'' notifications'; END IF;
  SELECT count(*) INTO n FROM public.notifications;
  IF n < 2 THEN RAISE EXCEPTION 'FAIL: creator cannot read own notifications (%)', n; END IF;
  SELECT count(*) INTO n FROM public.notification_preferences;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: creator reads another person''s preferences'; END IF;
  PERFORM pg_temp.expect_error(format('update public.notifications set read_at = null where recipient_id = %L', cr), '%permission denied%');
  PERFORM pg_temp.expect_error(format('insert into public.notification_preferences (profile_id) values (%L)', cr), '%permission denied%');
  PERFORM pg_temp.expect_error(format('delete from public.notifications where recipient_id = %L', cr), '%permission denied%');

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', cr2), true);
  SELECT count(*) INTO n FROM public.notifications;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: second creator sees % notifications', n; END IF;

  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', co), true);
  SELECT count(*) INTO n FROM public.notification_preferences WHERE profile_id = co;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: company cannot read own preferences'; END IF;

  -- Admins are not parties: no notifications, and no special read access.
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', ad), true);
  SELECT count(*) INTO n FROM public.notifications;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: admin reads notifications'; END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS notification RLS is recipient-only';

  SET LOCAL ROLE anon;
  PERFORM pg_temp.expect_error('select count(*) from public.notifications', '%permission denied%');
  RESET ROLE;
  RAISE NOTICE 'PASS anon has no access';

  -- The trigger function is not callable by clients.
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.expect_error('select private.notification_category(''terms_agreed'')', '%permission denied%');
  RESET ROLE;
END $$;

ROLLBACK;

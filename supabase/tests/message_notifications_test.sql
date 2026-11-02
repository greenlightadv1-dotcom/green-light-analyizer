-- 0030: in-app rooms notify the other party of a new message; email rooms do not.
BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('b7000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mcr@t.local','x',NOW(),NOW()),
  ('b8000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mco@t.local','x',NOW(),NOW()),
  ('b8000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mco2@t.local','x',NOW(),NOW());
INSERT INTO public.profiles (id, full_name, role, primary_email) VALUES
  ('b7000000-0000-0000-0000-000000000001','M Creator','creator','mcr@t.local'),
  ('b8000000-0000-0000-0000-000000000001','M Company','company','mco@t.local'),
  ('b8000000-0000-0000-0000-000000000002','M Other Co','company','mco2@t.local');
INSERT INTO public.deal_chats (id, creator_id, company_id, sender_email) VALUES
  ('c9000000-0000-0000-0000-000000000001','b7000000-0000-0000-0000-000000000001','b8000000-0000-0000-0000-000000000001','mco@t.local'),
  ('c9000000-0000-0000-0000-000000000002','b7000000-0000-0000-0000-000000000001',null,'sponsor@brand.example');

DO $$
DECLARE n int;
  cr uuid := 'b7000000-0000-0000-0000-000000000001';
  co uuid := 'b8000000-0000-0000-0000-000000000001';
  co2 uuid := 'b8000000-0000-0000-0000-000000000002';
  room uuid := 'c9000000-0000-0000-0000-000000000001';
  emailroom uuid := 'c9000000-0000-0000-0000-000000000002';
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.messages (chat_id, sender_id, message_text) VALUES (room, cr, 'one'), (room, cr, 'two');
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_id = co AND chat_id = room AND kind = 'message_received' AND read_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: expected one unread notification for the company, got %', n; END IF;
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_id = cr;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: the sender was notified'; END IF;
  RAISE NOTICE 'PASS a creator message notifies the company once per room';

  UPDATE public.notifications SET read_at = now() WHERE recipient_id = co;
  INSERT INTO public.messages (chat_id, sender_id, message_text) VALUES (room, cr, 'three');
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_id = co AND chat_id = room;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: a new message after reading should notify again (got %)', n; END IF;

  INSERT INTO public.messages (chat_id, sender_id, message_text) VALUES (room, co, 'reply');
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_id = cr AND chat_id = room;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: company reply did not notify the creator'; END IF;

  INSERT INTO public.messages (chat_id, sender_id, message_text) VALUES (emailroom, cr, 'by email');
  INSERT INTO public.messages (chat_id, sender_id, message_text) VALUES (room, null, 'system');
  SELECT count(*) INTO n FROM public.notifications WHERE chat_id = emailroom;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: email room produced an in-app notification'; END IF;
  RAISE NOTICE 'PASS email rooms and system messages notify nobody';

  INSERT INTO public.notification_preferences (profile_id, muted_categories) VALUES (cr, array['messages']);
  DELETE FROM public.notifications WHERE recipient_id = cr;
  INSERT INTO public.messages (chat_id, sender_id, message_text) VALUES (room, co, 'muted');
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_id = cr;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: muted messages still notified'; END IF;
  RAISE NOTICE 'PASS muting messages works';
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', co2), true);
  SELECT count(*) INTO n FROM public.notifications;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: another company sees message notifications'; END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS message notifications are recipient-only';
END $$;
ROLLBACK;

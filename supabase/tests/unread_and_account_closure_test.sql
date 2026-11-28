-- Green Light — 0044: email rooms notify their creator; close_account().
-- Runs inside a transaction that rolls back.
BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('cccccccc-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cr@test.local','x',NOW(),NOW()),
  ('cccccccc-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','co@test.local','x',NOW(),NOW()),
  ('cccccccc-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ad@test.local','x',NOW(),NOW()),
  ('cccccccc-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cr2@test.local','x',NOW(),NOW());

INSERT INTO public.profiles (id, full_name, role, primary_email, inbound_alias, shareable_slug, whatsapp_number) VALUES
  ('cccccccc-0000-0000-0000-000000000001','Creator One','creator','one@gmail.com','one.ab12@analyze.greenlightadvs.com','creator-one','+201012345678'),
  ('cccccccc-0000-0000-0000-000000000002','Acme','company','ceo@acme.example',NULL,NULL,NULL),
  ('cccccccc-0000-0000-0000-000000000003','Admin','admin','admin@greenlightadvs.com',NULL,NULL,NULL),
  ('cccccccc-0000-0000-0000-000000000004','Creator Two','creator','two@gmail.com',NULL,NULL,NULL);

INSERT INTO public.deal_chats (id, creator_id, company_id, sender_email, sponsorship_type, deal_status) VALUES
  ('cccccccc-0000-0000-0000-0000000000e1','cccccccc-0000-0000-0000-000000000001',NULL,'brand@sponsor.example','post','new'),
  ('cccccccc-0000-0000-0000-0000000000a1','cccccccc-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000002','x','post','negotiating'),
  ('cccccccc-0000-0000-0000-0000000000a2','cccccccc-0000-0000-0000-000000000004','cccccccc-0000-0000-0000-000000000002','x','post','agreed');

INSERT INTO public.media_kits (creator_id, platform, avg_views, audience_verified, verified_top_countries)
VALUES ('cccccccc-0000-0000-0000-000000000001','youtube',5000,true,'[{"country":"EG","pct":46}]');
INSERT INTO public.oauth_connections (creator_id, platform, access_token, refresh_token, expires_at)
VALUES ('cccccccc-0000-0000-0000-000000000001','youtube','a','r', now() + interval '1 hour');

DO $test$
DECLARE n int; v text; p public.profiles%rowtype;
BEGIN
  -- 1. Email room: the platform summary (no sender) notifies the creator.
  INSERT INTO public.messages (chat_id, sender_id, message_text) VALUES ('cccccccc-0000-0000-0000-0000000000e1', NULL, 'summary');
  SELECT count(*) INTO n FROM public.notifications
   WHERE recipient_id = 'cccccccc-0000-0000-0000-000000000001' AND chat_id = 'cccccccc-0000-0000-0000-0000000000e1' AND read_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 1: email room summary left % unread rows', n; END IF;
  RAISE NOTICE 'PASS 1: a new email room leaves one unread notification for its creator';

  -- 2. A second sponsor message keeps one unread row, not two.
  INSERT INTO public.messages (chat_id, sender_id, message_text) VALUES ('cccccccc-0000-0000-0000-0000000000e1', NULL, 'sponsor reply');
  SELECT count(*) INTO n FROM public.notifications WHERE chat_id = 'cccccccc-0000-0000-0000-0000000000e1' AND read_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 2: % unread rows', n; END IF;
  RAISE NOTICE 'PASS 2: one unread row per room';

  -- 3. The creator's own reply notifies nobody.
  UPDATE public.notifications SET read_at = now() WHERE chat_id = 'cccccccc-0000-0000-0000-0000000000e1';
  INSERT INTO public.messages (chat_id, sender_id, message_text) VALUES ('cccccccc-0000-0000-0000-0000000000e1', 'cccccccc-0000-0000-0000-000000000001', 'my reply');
  SELECT count(*) INTO n FROM public.notifications WHERE chat_id = 'cccccccc-0000-0000-0000-0000000000e1' AND read_at IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 3: own reply notified'; END IF;
  RAISE NOTICE 'PASS 3: the creator''s own message notifies nobody';

  -- 4. In-app rooms unchanged: a platform message notifies nobody, a company message notifies the creator.
  INSERT INTO public.messages (chat_id, sender_id, message_text) VALUES ('cccccccc-0000-0000-0000-0000000000a1', NULL, 'system');
  SELECT count(*) INTO n FROM public.notifications WHERE chat_id = 'cccccccc-0000-0000-0000-0000000000a1';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 4a: system message in in-app room notified'; END IF;
  INSERT INTO public.messages (chat_id, sender_id, message_text) VALUES ('cccccccc-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-000000000002', 'hi');
  SELECT count(*) INTO n FROM public.notifications WHERE chat_id = 'cccccccc-0000-0000-0000-0000000000a1' AND recipient_id = 'cccccccc-0000-0000-0000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 4b: company message did not notify the creator'; END IF;
  RAISE NOTICE 'PASS 4: in-app rooms behave as in 0030';

  -- 5. close_account refuses an admin.
  BEGIN
    PERFORM public.close_account('cccccccc-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'FAIL 5: admin closed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'account:admin' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 5: an admin cannot close their own account';
  END;

  -- 6. close_account refuses an account with an agreed deal (the company here).
  BEGIN
    PERFORM public.close_account('cccccccc-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'FAIL 6: closed with an agreed deal';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'account:open_deals' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 6: an account with an agreed deal cannot be closed';
  END;

  -- 7. Closing the creator removes platform data and anonymises the profile.
  PERFORM public.close_account('cccccccc-0000-0000-0000-000000000001');
  IF EXISTS (SELECT 1 FROM public.media_kits WHERE creator_id = 'cccccccc-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL 7a: media kit kept';
  END IF;
  IF EXISTS (SELECT 1 FROM public.oauth_connections WHERE creator_id = 'cccccccc-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL 7b: token kept';
  END IF;
  SELECT * INTO p FROM public.profiles WHERE id = 'cccccccc-0000-0000-0000-000000000001';
  IF p.full_name <> 'Deleted account' OR p.primary_email LIKE '%gmail%' OR p.inbound_alias IS NOT NULL
     OR p.shareable_slug IS NOT NULL OR p.whatsapp_number IS NOT NULL OR p.banned_reason <> 'account_closed' OR p.banned_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 7c: profile not anonymised';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE recipient_id = 'cccccccc-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL 7d: notifications kept';
  END IF;
  RAISE NOTICE 'PASS 7: platform data deleted and the profile anonymised';

  -- 8. Deal records stay (Privacy §9).
  SELECT count(*) INTO n FROM public.deal_chats WHERE creator_id = 'cccccccc-0000-0000-0000-000000000001';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL 8: deal rooms changed (%)', n; END IF;
  RAISE NOTICE 'PASS 8: deal rooms are kept';

  -- 9. Closing twice is refused.
  BEGIN
    PERFORM public.close_account('cccccccc-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'FAIL 9: closed twice';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'account:closed' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 9: a closed account cannot be closed again';
  END;

  -- 10. Only service_role may call it.
  IF has_function_privilege('authenticated', 'public.close_account(uuid)', 'execute') THEN
    RAISE EXCEPTION 'FAIL 10: authenticated can execute close_account';
  END IF;
  RAISE NOTICE 'PASS 10: close_account is service_role only';
END
$test$;

ROLLBACK;

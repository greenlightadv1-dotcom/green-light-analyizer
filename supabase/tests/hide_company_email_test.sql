-- Green Light — 0043: in-app deals never store the company's real email.
-- Runs inside a transaction that rolls back.
BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c@test.local','x',NOW(),NOW()),
  ('bbbbbbbb-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','co@test.local','x',NOW(),NOW()),
  ('bbbbbbbb-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','co2@test.local','x',NOW(),NOW());

INSERT INTO public.profiles (id, full_name, role, primary_email, inbound_alias) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001','Creator','creator','creator-real@gmail.com','creator.x1@analyze.greenlight.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002','Acme Brand','company','ceo@acme.example',NULL),
  ('bbbbbbbb-0000-0000-0000-000000000003','   ','company','sales@sneaky.example',NULL);

INSERT INTO public.deal_chats (id, creator_id, company_id, sender_email, sponsorship_type) VALUES
  ('bbbbbbbb-0000-0000-0000-0000000000d1','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','ceo@acme.example','post'),
  ('bbbbbbbb-0000-0000-0000-0000000000d2','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000003','sales@sneaky.example','post'),
  ('bbbbbbbb-0000-0000-0000-0000000000d3','bbbbbbbb-0000-0000-0000-000000000001',NULL,'brand@sponsor.example','post');

DO $test$
DECLARE v text;
BEGIN
  SELECT sender_email INTO v FROM public.deal_chats WHERE id = 'bbbbbbbb-0000-0000-0000-0000000000d1';
  IF v <> 'Acme Brand' THEN RAISE EXCEPTION 'FAIL 1: in-app room kept %', v; END IF;
  RAISE NOTICE 'PASS 1: in-app room shows the company name, not its email';

  SELECT sender_email INTO v FROM public.deal_chats WHERE id = 'bbbbbbbb-0000-0000-0000-0000000000d2';
  IF v <> 'Company on Green Light' THEN RAISE EXCEPTION 'FAIL 2: blank name kept %', v; END IF;
  RAISE NOTICE 'PASS 2: a company with no usable name falls back to a neutral label';

  UPDATE public.deal_chats SET sender_email = 'ceo@acme.example' WHERE id = 'bbbbbbbb-0000-0000-0000-0000000000d1';
  SELECT sender_email INTO v FROM public.deal_chats WHERE id = 'bbbbbbbb-0000-0000-0000-0000000000d1';
  IF v <> 'Acme Brand' THEN RAISE EXCEPTION 'FAIL 3: update wrote %', v; END IF;
  RAISE NOTICE 'PASS 3: an update cannot put the email back';

  SELECT sender_email INTO v FROM public.deal_chats WHERE id = 'bbbbbbbb-0000-0000-0000-0000000000d3';
  IF v <> 'brand@sponsor.example' THEN RAISE EXCEPTION 'FAIL 4: email room changed to %', v; END IF;
  RAISE NOTICE 'PASS 4: an email room keeps the sponsor address';

  IF EXISTS (SELECT 1 FROM public.deal_chats WHERE company_id IS NOT NULL AND sender_email ~ '@') THEN
    RAISE EXCEPTION 'FAIL 5: an in-app room still holds an address';
  END IF;
  RAISE NOTICE 'PASS 5: no in-app room holds an address';

  BEGIN
    UPDATE public.profiles SET full_name = 'Creator 01012345678' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'FAIL 6: a phone number in a name was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS 6: a name with a phone number is refused';
  END;
  BEGIN
    UPDATE public.profiles SET full_name = 'Creator wa.me/x' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'FAIL 7: a link in a name was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS 7: a name with a link is refused';
  END;
  UPDATE public.profiles SET full_name = 'محمد زياد Studio 7' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
  RAISE NOTICE 'PASS 8: an ordinary name is accepted';
END
$test$;

ROLLBACK;

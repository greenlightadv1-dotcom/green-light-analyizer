-- 0038: one request key creates at most one brief per company; separate keys,
-- keyless rows and other companies are unaffected.
BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('f3800000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rk1@t.local','x',NOW(),NOW()),
  ('f3800000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rk2@t.local','x',NOW(),NOW());
INSERT INTO public.profiles (id, full_name, role, primary_email) VALUES
  ('f3800000-0000-0000-0000-000000000001','Key Co One','company','rk1@t.local'),
  ('f3800000-0000-0000-0000-000000000002','Key Co Two','company','rk2@t.local');

DO $$
DECLARE n int; c1 uuid := 'f3800000-0000-0000-0000-000000000001'; c2 uuid := 'f3800000-0000-0000-0000-000000000002';
  k uuid := 'a3800000-0000-4000-8000-000000000001';
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.briefs (company_id, title, description, request_key) VALUES (c1, 'First', 'A campaign brief', k);
  BEGIN
    INSERT INTO public.briefs (company_id, title, description, request_key) VALUES (c1, 'First again', 'A campaign brief', k);
    RAISE EXCEPTION 'FAIL: a second brief with the same key was created';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS same company + same key refused (23505)';
  END;
  -- The same key from another company is a different operation.
  INSERT INTO public.briefs (company_id, title, description, request_key) VALUES (c2, 'Other company', 'A campaign brief', k);
  -- A new key is a new brief; keyless rows (pre-0038 and edits) never collide.
  INSERT INTO public.briefs (company_id, title, description, request_key) VALUES (c1, 'Second', 'A campaign brief', gen_random_uuid());
  INSERT INTO public.briefs (company_id, title, description) VALUES (c1, 'Keyless one', 'A campaign brief'), (c1, 'Keyless two', 'A campaign brief');
  SELECT count(*) INTO n FROM public.briefs WHERE company_id = c1; IF n <> 4 THEN RAISE EXCEPTION 'FAIL: % briefs for c1, expected 4', n; END IF;
  RAISE NOTICE 'PASS separate keys, other companies and keyless rows are unaffected';
  -- Editing a brief never needs or changes the key.
  UPDATE public.briefs SET title = 'First, edited' WHERE company_id = c1 AND request_key = k;
  SELECT count(*) INTO n FROM public.briefs WHERE company_id = c1 AND request_key = k AND title = 'First, edited'; IF n <> 1 THEN RAISE EXCEPTION 'FAIL: edit'; END IF;
  RAISE NOTICE 'PASS edits keep the key';
END $$;
ROLLBACK;

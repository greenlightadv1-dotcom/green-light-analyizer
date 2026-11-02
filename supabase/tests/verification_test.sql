-- 0032: verification state machine, required documents, admin-only decisions, RLS.
BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('e1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','vcr@t.local','x',NOW(),NOW()),
  ('e1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','vcr2@t.local','x',NOW(),NOW()),
  ('e2000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','vco@t.local','x',NOW(),NOW()),
  ('e2000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','vrep@t.local','x',NOW(),NOW()),
  ('e3000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','vad@t.local','x',NOW(),NOW());
INSERT INTO public.profiles (id, full_name, role, primary_email, account_status) VALUES
  ('e1000000-0000-0000-0000-000000000001','V Creator','creator','vcr@t.local','pending_verification'),
  ('e1000000-0000-0000-0000-000000000002','V Creator Two','creator','vcr2@t.local','active'),
  ('e2000000-0000-0000-0000-000000000001','V Company','company','vco@t.local','active'),
  ('e2000000-0000-0000-0000-000000000002','V Rep','company','vrep@t.local','pending_verification'),
  ('e3000000-0000-0000-0000-000000000001','V Admin','admin','vad@t.local','active');

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
DECLARE n int; s text; kyc uuid; kyb uuid; rep uuid;
  cr uuid := 'e1000000-0000-0000-0000-000000000001';
  cr2 uuid := 'e1000000-0000-0000-0000-000000000002';
  co uuid := 'e2000000-0000-0000-0000-000000000001';
  rp uuid := 'e2000000-0000-0000-0000-000000000002';
  ad uuid := 'e3000000-0000-0000-0000-000000000001';
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.verification_cases (profile_id, kind, details) VALUES (cr, 'creator_kyc', '{"legal_name":"V Creator"}') RETURNING id INTO kyc;
  INSERT INTO public.verification_cases (profile_id, kind) VALUES (co, 'company_kyb') RETURNING id INTO kyb;
  INSERT INTO public.verification_cases (profile_id, kind) VALUES (rp, 'representative') RETURNING id INTO rep;
  PERFORM pg_temp.expect_error(format('insert into public.verification_cases (profile_id, kind) values (%L, %L)', cr, 'creator_kyc'), '%verification_cases_one_per_kind%');

  -- Submitting needs the required documents.
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', cr, kyc, 'submit'), 'verification:documents_missing%');
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes)
    VALUES (kyc, 'id_front', kyc || '/' || gen_random_uuid() || '.jpg', 'image/jpeg', 1000);
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', cr2, kyc, 'submit'), 'verification:not_found%');
  s := public.verification_transition(cr, kyc, 'submit');
  IF s <> 'submitted' THEN RAISE EXCEPTION 'FAIL: submit returned %', s; END IF;
  PERFORM pg_temp.expect_error(format('insert into public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes) values (%L,%L,%L,%L,1)', kyc, 'other', 'public/../x.jpg', 'image/jpeg'), '%check%');

  -- Only an admin decides, and never on their own case.
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', cr, kyc, 'approve'), 'verification:not_allowed%');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', co, kyc, 'approve'), 'verification:not_allowed%');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L,null)', ad, kyc, 'request_info'), 'verification:note_required%');
  PERFORM public.verification_transition(ad, kyc, 'request_info', 'Please upload the back of the card.');
  SELECT status INTO s FROM public.verification_cases WHERE id = kyc;
  IF s <> 'needs_info' THEN RAISE EXCEPTION 'FAIL: expected needs_info, got %', s; END IF;
  PERFORM public.verification_transition(cr, kyc, 'submit');
  PERFORM public.verification_transition(ad, kyc, 'start_review');
  PERFORM public.verification_transition(ad, kyc, 'approve');
  SELECT account_status INTO s FROM public.profiles WHERE id = cr;
  IF s <> 'active' THEN RAISE EXCEPTION 'FAIL: approval did not activate the account (%)', s; END IF;
  SELECT method INTO s FROM public.verification_cases WHERE id = kyc;
  IF s <> 'manual_document_review' THEN RAISE EXCEPTION 'FAIL: method %', s; END IF;
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L,%L)', ad, kyc, 'reject', 'late'), 'verification:invalid_state%');
  SELECT count(*) INTO n FROM public.verification_events WHERE case_id = kyc;
  IF n <> 5 THEN RAISE EXCEPTION 'FAIL: expected 5 history events, got %', n; END IF;
  RAISE NOTICE 'PASS creator KYC: documents required, admin-only decisions, approval activates';

  -- Company KYB needs both documents.
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes)
    VALUES (kyb, 'commercial_register', kyb || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 1000);
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', co, kyb, 'submit'), 'verification:documents_missing%');
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes)
    VALUES (kyb, 'tax_card', kyb || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 1000);
  PERFORM public.verification_transition(co, kyb, 'submit');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L,null)', ad, kyb, 'reject'), 'verification:note_required%');

  -- A representative is linked only by an admin, to a real company, and gets no deal access.
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes)
    VALUES (rep, 'authorization_letter', rep || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 1000);
  PERFORM public.verification_transition(rp, rep, 'submit');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L,null,null)', ad, rep, 'approve'), 'verification:company_required%');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L,null,%L)', ad, rep, 'approve', cr2), 'verification:company_required%');
  PERFORM public.verification_transition(ad, rep, 'approve', null, co);
  SELECT count(*) INTO n FROM public.company_members WHERE member_id = rp AND company_id = co AND member_role = 'representative';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: representative not linked'; END IF;
  RAISE NOTICE 'PASS representative linked by admin approval only';
  RESET ROLE;

  -- Clients cannot write or decide; each person reads only their own case.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', cr2), true);
  SELECT count(*) INTO n FROM public.verification_cases;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: another creator reads cases'; END IF;
  SELECT count(*) INTO n FROM public.verification_documents;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: another creator reads documents'; END IF;
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', ad, kyb, 'approve'), '%permission denied%');
  PERFORM pg_temp.expect_error(format('update public.profiles set account_status = %L where id = %L', 'active', cr2), '%permission denied%');
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', cr), true);
  SELECT count(*) INTO n FROM public.verification_cases;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: subject cannot read own case'; END IF;
  PERFORM pg_temp.expect_error(format('update public.verification_cases set status = %L where id = %L', 'approved', kyc), '%permission denied%');
  PERFORM pg_temp.expect_error(format('insert into public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes) values (%L,%L,%L,%L,1)', kyc, 'other', kyc || '/' || gen_random_uuid() || '.jpg', 'image/jpeg'), '%permission denied%');
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', ad), true);
  SELECT count(*) INTO n FROM public.verification_cases;
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL: admin sees % cases', n; END IF;
  RESET ROLE;
  SET LOCAL ROLE anon;
  PERFORM pg_temp.expect_error('select count(*) from public.verification_cases', '%permission denied%');
  RESET ROLE;
  SELECT public INTO s FROM storage.buckets WHERE id = 'verification-docs';
  IF s::boolean THEN RAISE EXCEPTION 'FAIL: documents bucket is public'; END IF;
  RAISE NOTICE 'PASS RLS, grants and private bucket';
END $$;
ROLLBACK;

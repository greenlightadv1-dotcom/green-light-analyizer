-- 0039: explicit email verification before submission, representative identity
-- images, a creator application's public photo, rejected applicants can read
-- (not edit) their application.
BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('f3000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rt-ad@t.local','x',NOW(),NOW()),
  ('f2000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rt-co@t.local','x',NOW(),NOW()),
  ('f1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rt-cr@t.local','x',NOW(),NOW());
INSERT INTO public.profiles (id, full_name, role, primary_email, account_status) VALUES
  ('f3000000-0000-0000-0000-000000000001','RT Reviewer','admin','rt-ad@t.local','active'),
  ('f2000000-0000-0000-0000-000000000001','RT Company','company','rt-co@t.local','active'),
  ('f1000000-0000-0000-0000-000000000001','RT Creator','creator','rt-cr@t.local','pending_verification');

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_like text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE p_like THEN RAISE NOTICE 'PASS refused: %', SQLERRM; RETURN; END IF;
    RAISE EXCEPTION 'FAIL: % raised "%", expected %', p_sql, SQLERRM, p_like;
  END;
  RAISE EXCEPTION 'FAIL: % succeeded, expected %', p_sql, p_like;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.camera(p_case uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes, capture_method)
  SELECT p_case, d, p_case || '/' || gen_random_uuid() || '.jpg', 'image/jpeg', 1000, 'camera'
    FROM unnest(array['selfie','id_front','id_back']) d $$;

DO $$
DECLARE n int; s text; req uuid; kyc uuid; rep_req uuid; rep uuid; own uuid;
  ad uuid := 'f3000000-0000-0000-0000-000000000001';
  co uuid := 'f2000000-0000-0000-0000-000000000001';
  cr uuid := 'f1000000-0000-0000-0000-000000000001';
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.verification_reviewers (admin_id) VALUES (ad);

  -- 1. An application with an unverified email cannot be submitted.
  INSERT INTO public.access_requests (journey, full_name, email) VALUES ('creator', 'RT Applicant', 'rt-app@t.local') RETURNING id INTO req;
  INSERT INTO public.verification_cases (access_request_id, kind) VALUES (req, 'creator_kyc') RETURNING id INTO kyc;
  PERFORM pg_temp.camera(kyc);
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes)
    VALUES (kyc, 'profile_photo', kyc || '/' || gen_random_uuid() || '.webp', 'image/webp', 1000);
  PERFORM pg_temp.expect_error(format('select public.verification_transition(null,%L,%L)', kyc, 'submit'), 'verification:email_unverified%');
  -- Nor by a direct service-role update that skips the transition function.
  PERFORM pg_temp.expect_error(format('update public.verification_cases set status = %L where id = %L', 'submitted', kyc), 'verification:email_unverified%');
  UPDATE public.access_requests SET email_verified_at = now() WHERE id = req;
  s := public.verification_transition(null, kyc, 'submit');
  IF s <> 'submitted' THEN RAISE EXCEPTION 'FAIL: verified submit %', s; END IF;
  RAISE NOTICE 'PASS email must be verified before submission';

  -- 2. The public photo is an image upload, never a PDF or a camera capture,
  --    and a creator application needs one.
  PERFORM pg_temp.expect_error(format('insert into public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes) values (%L,%L,%L,%L,1000)',
    kyc, 'profile_photo', kyc || '/' || gen_random_uuid() || '.pdf', 'application/pdf'), '%verification_profile_photo_is_image%');
  PERFORM pg_temp.expect_error(format('insert into public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes, capture_method) values (%L,%L,%L,%L,1000,%L)',
    kyc, 'profile_photo', kyc || '/' || gen_random_uuid() || '.jpg', 'image/jpeg', 'camera'), '%verification_profile_photo_is_image%');
  INSERT INTO public.access_requests (email_verified_at, journey, full_name, email) VALUES (now(), 'creator', 'RT No Photo', 'rt-nophoto@t.local') RETURNING id INTO req;
  INSERT INTO public.verification_cases (access_request_id, kind) VALUES (req, 'creator_kyc') RETURNING id INTO kyc;
  PERFORM pg_temp.camera(kyc);
  PERFORM pg_temp.expect_error(format('select public.verification_transition(null,%L,%L)', kyc, 'submit'), 'verification:documents_missing%');
  -- An existing account's case manages its photo in its profile: not required there.
  INSERT INTO public.verification_cases (profile_id, kind) VALUES (cr, 'creator_kyc') RETURNING id INTO own;
  PERFORM pg_temp.camera(own);
  s := public.verification_transition(cr, own, 'submit');
  IF s <> 'submitted' THEN RAISE EXCEPTION 'FAIL: account case submit %', s; END IF;
  RAISE NOTICE 'PASS public photo rules';

  -- 3. A representative needs identity images as well as the authorization letter.
  INSERT INTO public.access_requests (email_verified_at, journey, full_name, email, company_name) VALUES (now(), 'company_representative', 'RT Rep', 'rt-rep@t.local', 'RT Company') RETURNING id INTO rep_req;
  INSERT INTO public.verification_cases (access_request_id, kind) VALUES (rep_req, 'representative') RETURNING id INTO rep;
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes)
    VALUES (rep, 'authorization_letter', rep || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 1000);
  PERFORM pg_temp.expect_error(format('select public.verification_transition(null,%L,%L)', rep, 'submit'), 'verification:documents_missing%');
  PERFORM pg_temp.expect_error(format('insert into public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes, capture_method) values (%L,%L,%L,%L,1000,%L)',
    rep, 'id_front', rep || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 'upload'), '%verification_identity_images_are_camera%');
  PERFORM pg_temp.camera(rep);
  PERFORM public.verification_transition(null, rep, 'submit');
  -- Entering a company name grants nothing: approval needs an explicit, existing company.
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L,null,null)', ad, rep, 'approve'), 'verification:company_required%');
  SELECT count(*) INTO n FROM public.company_members WHERE company_id = co;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a link exists before approval'; END IF;
  RAISE NOTICE 'PASS representative identity and explicit company approval';

  -- 4. Rejected: the applicant can get a new link and read the decision, but not edit.
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes)
    VALUES (kyc, 'profile_photo', kyc || '/' || gen_random_uuid() || '.png', 'image/png', 1000);
  PERFORM public.verification_transition(null, kyc, 'submit');
  PERFORM public.verification_transition(ad, kyc, 'reject', 'Your ID photo was unreadable.');
  PERFORM public.application_token_issue(req, 'resume', repeat('6', 64), 3600, null);
  SELECT state INTO s FROM public.application_token_lookup(repeat('6', 64), 'resume');
  IF s <> 'valid' THEN RAISE EXCEPTION 'FAIL: rejected applicant link %', s; END IF;
  SELECT decision_reason INTO s FROM public.verification_cases WHERE id = kyc;
  IF s <> 'Your ID photo was unreadable.' THEN RAISE EXCEPTION 'FAIL: reason %', s; END IF;
  PERFORM pg_temp.expect_error(format('select public.verification_transition(null,%L,%L)', kyc, 'submit'), 'verification:invalid_state%');
  PERFORM pg_temp.expect_error(format('select public.application_token_issue(%L,%L,%L,3600,%L)', req, 'activation', repeat('5', 64), ad), 'activation:not_approved%');
  RAISE NOTICE 'PASS rejected applicant reads, cannot edit or activate';

  -- 5. The new event is accepted; arbitrary ones are not.
  INSERT INTO public.verification_events (case_id, event) VALUES (rep, 'email_verified');
  PERFORM pg_temp.expect_error(format('insert into public.verification_events (case_id, event) values (%L,%L)', rep, 'made_up'), '%verification_events_event_check%');
  RESET ROLE;

  -- 6. Clients still cannot read applications or write verification state.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', cr), true);
  PERFORM pg_temp.expect_error('select email_verified_at from public.access_requests', '%permission denied%');
  PERFORM pg_temp.expect_error(format('update public.verification_cases set status = %L where id = %L', 'submitted', own), '%permission denied%');
  RESET ROLE;
  RAISE NOTICE 'PASS grants unchanged';
END $$;
ROLLBACK;

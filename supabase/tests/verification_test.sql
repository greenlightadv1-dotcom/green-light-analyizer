-- 0032: verification before an account exists, one-time activation, reviewer
-- allowlist, camera-only identity images, RLS.
BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('e1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','vcr2@t.local','x',NOW(),NOW()),
  ('e2000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','vco@t.local','x',NOW(),NOW()),
  ('e3000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','vad@t.local','x',NOW(),NOW()),
  ('e3000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','vad2@t.local','x',NOW(),NOW()),
  -- Auth users the activation step "creates" (the real step calls the Auth admin API).
  ('e4000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','new.creator@t.local','x',NOW(),NOW()),
  ('e4000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','new.rep@t.local','x',NOW(),NOW()),
  ('e4000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@t.local','x',NOW(),NOW());
INSERT INTO public.profiles (id, full_name, role, primary_email, account_status) VALUES
  ('e1000000-0000-0000-0000-000000000002','V Creator Two','creator','vcr2@t.local','active'),
  ('e2000000-0000-0000-0000-000000000001','V Company','company','vco@t.local','active'),
  ('e3000000-0000-0000-0000-000000000001','V Reviewer','admin','vad@t.local','active'),
  ('e3000000-0000-0000-0000-000000000002','V Admin Not Reviewer','admin','vad2@t.local','active');

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
DECLARE n int; s text; kyc uuid; kyb uuid; rep uuid; req uuid; req_rep uuid; req_co uuid; tok uuid;
  cr2 uuid := 'e1000000-0000-0000-0000-000000000002';
  co uuid := 'e2000000-0000-0000-0000-000000000001';
  ad uuid := 'e3000000-0000-0000-0000-000000000001';
  ad2 uuid := 'e3000000-0000-0000-0000-000000000002';
  u1 uuid := 'e4000000-0000-0000-0000-000000000001';
  u2 uuid := 'e4000000-0000-0000-0000-000000000002';
  u3 uuid := 'e4000000-0000-0000-0000-000000000003';
  h_resume text := repeat('a', 64);
  h_act text := repeat('b', 64);
  h_act2 text := repeat('c', 64);
  h_rep text := repeat('d', 64);
  h_exp text := repeat('e', 64);
BEGIN
  SET LOCAL ROLE service_role;
  -- Only the owner's grant makes someone a reviewer.
  INSERT INTO public.verification_reviewers (admin_id) VALUES (ad);

  -- An application: no auth user, no profile.
  INSERT INTO public.access_requests (journey, full_name, email) VALUES ('creator', 'New Creator', 'New.Creator@t.local') RETURNING id INTO req;
  INSERT INTO public.verification_cases (access_request_id, kind, details) VALUES (req, 'creator_kyc', '{"legal_name":"New Creator"}') RETURNING id INTO kyc;
  PERFORM pg_temp.expect_error(format('insert into public.verification_cases (access_request_id, kind) values (%L, %L)', req, 'creator_kyc'), '%verification_cases_one_per_application%');
  PERFORM pg_temp.expect_error('insert into public.verification_cases (kind) values (''creator_kyc'')', '%verification_case_owner%');
  PERFORM public.application_token_issue(req, 'resume', h_resume, 3600, null);
  SELECT state INTO s FROM public.application_token_lookup(h_resume, 'resume');
  IF s <> 'valid' THEN RAISE EXCEPTION 'FAIL: resume token %', s; END IF;
  SELECT count(*) INTO n FROM public.application_token_lookup(repeat('f', 64), 'resume');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: unknown token returned a row'; END IF;
  PERFORM pg_temp.expect_error(format('select public.application_token_issue(%L,%L,%L,60,null)', req, 'resume', repeat('9', 64)), 'activation:invalid_input%');

  -- Identity images must be camera JPEGs.
  PERFORM pg_temp.expect_error(format('insert into public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes, capture_method) values (%L,%L,%L,%L,1000,%L)',
    kyc, 'id_front', kyc || '/' || gen_random_uuid() || '.jpg', 'image/jpeg', 'upload'), '%verification_identity_images_are_camera%');
  PERFORM pg_temp.expect_error(format('insert into public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes, capture_method) values (%L,%L,%L,%L,1000,%L)',
    kyc, 'selfie', kyc || '/' || gen_random_uuid() || '.png', 'image/png', 'camera'), '%verification_identity_images_are_camera%');
  PERFORM pg_temp.expect_error(format('insert into public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes) values (%L,%L,%L,%L,1)', kyc, 'other', 'public/../x.jpg', 'image/jpeg'), '%check%');

  -- Submission needs selfie + both sides of the ID.
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes, capture_method)
    VALUES (kyc, 'id_front', kyc || '/' || gen_random_uuid() || '.jpg', 'image/jpeg', 1000, 'camera'),
           (kyc, 'id_back', kyc || '/' || gen_random_uuid() || '.jpg', 'image/jpeg', 1000, 'camera');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(null,%L,%L)', kyc, 'submit'), 'verification:documents_missing%');
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes, capture_method)
    VALUES (kyc, 'selfie', kyc || '/' || gen_random_uuid() || '.jpg', 'image/jpeg', 1000, 'camera');
  -- An account cannot submit someone else's application.
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', cr2, kyc, 'submit'), 'verification:not_found%');
  s := public.verification_transition(null, kyc, 'submit');
  IF s <> 'submitted' THEN RAISE EXCEPTION 'FAIL: submit returned %', s; END IF;

  -- No activation before approval.
  PERFORM pg_temp.expect_error(format('select public.application_token_issue(%L,%L,%L,3600,%L)', req, 'activation', h_act, ad), 'activation:not_approved%');

  -- Only a granted reviewer decides; an ordinary admin, the applicant or a company cannot.
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', ad2, kyc, 'approve'), 'verification:not_allowed%');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', co, kyc, 'approve'), 'verification:not_allowed%');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(null,%L,%L)', kyc, 'approve'), 'verification:not_allowed%');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L,null)', ad, kyc, 'request_info'), 'verification:note_required%');
  PERFORM public.verification_transition(ad, kyc, 'request_info', 'Please retake the back of the card.');
  PERFORM public.verification_transition(null, kyc, 'submit');
  PERFORM public.verification_transition(ad, kyc, 'start_review');
  PERFORM public.verification_transition(ad, kyc, 'approve');
  SELECT count(*) INTO n FROM public.profiles WHERE lower(primary_email) = 'new.creator@t.local';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: approval created a profile'; END IF;
  RAISE NOTICE 'PASS application reviewed and approved with no account';

  -- Activation: only a reviewer issues it; a new link revokes the old one.
  PERFORM pg_temp.expect_error(format('select public.application_token_issue(%L,%L,%L,3600,%L)', req, 'activation', h_act, ad2), 'activation:not_allowed%');
  PERFORM public.application_token_issue(req, 'activation', h_act, 3600, ad);
  PERFORM public.application_token_issue(req, 'activation', h_act2, 3600, ad);
  SELECT state INTO s FROM public.application_token_lookup(h_act, 'activation');
  IF s <> 'revoked' THEN RAISE EXCEPTION 'FAIL: older activation link still %', s; END IF;
  PERFORM pg_temp.expect_error(format('select * from public.activation_claim(%L)', h_act), 'activation:revoked%');

  -- Claim → concurrent claim refused → checkpoint → complete.
  SELECT count(*) INTO n FROM public.activation_claim(h_act2) WHERE email = 'new.creator@t.local';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: claim did not return the application'; END IF;
  PERFORM pg_temp.expect_error(format('select * from public.activation_claim(%L)', h_act2), 'activation:in_progress%');
  PERFORM pg_temp.expect_error(format('select public.activation_complete(%L,%L,%L)', h_act2, u1, 'new.ab12'), 'activation:not_claimed%');
  PERFORM public.activation_checkpoint(h_act2, u1);
  PERFORM pg_temp.expect_error(format('select public.activation_complete(%L,%L,%L)', h_act2, u3, 'new.ab12'), 'activation:not_claimed%');
  PERFORM public.activation_complete(h_act2, u1, 'new.ab12');
  SELECT role || ':' || account_status || ':' || inbound_alias INTO s FROM public.profiles WHERE id = u1;
  IF s <> 'creator:active:new.ab12' THEN RAISE EXCEPTION 'FAIL: activated profile %', s; END IF;
  SELECT count(*) INTO n FROM public.verification_cases WHERE id = kyc AND profile_id = u1;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: case not linked to the new account'; END IF;
  SELECT status INTO s FROM public.access_requests WHERE id = req;
  IF s <> 'approved' THEN RAISE EXCEPTION 'FAIL: application status %', s; END IF;
  -- Replay: the same link cannot create a second account.
  PERFORM pg_temp.expect_error(format('select * from public.activation_claim(%L)', h_act2), 'activation:used%');
  PERFORM pg_temp.expect_error(format('select public.activation_complete(%L,%L,%L)', h_act2, u3, 'x.ab12'), 'activation:used%');
  PERFORM pg_temp.expect_error(format('select public.application_token_issue(%L,%L,%L,3600,%L)', req, 'activation', repeat('1', 64), ad), 'activation:already_activated%');
  SELECT state INTO s FROM public.application_token_lookup(h_resume, 'resume');
  IF s NOT IN ('used', 'revoked') THEN RAISE EXCEPTION 'FAIL: resume link after activation is %', s; END IF;
  RAISE NOTICE 'PASS one-time activation, replay refused';

  -- Expiry is enforced by the database clock.
  INSERT INTO public.access_requests (journey, full_name, email, company_name) VALUES ('company', 'Co Applicant', 'co.applicant@t.local', 'Acme') RETURNING id INTO req_co;
  INSERT INTO public.verification_cases (access_request_id, kind) VALUES (req_co, 'company_kyb') RETURNING id INTO kyb;
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes)
    VALUES (kyb, 'commercial_register', kyb || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 1000),
           (kyb, 'tax_card', kyb || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 1000);
  -- Company KYB also needs evidence that the applicant may act for the company.
  PERFORM pg_temp.expect_error(format('select public.verification_transition(null,%L,%L)', kyb, 'submit'), 'verification:documents_missing%');
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes)
    VALUES (kyb, 'authorization_letter', kyb || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 1000);
  PERFORM public.verification_transition(null, kyb, 'submit');
  PERFORM public.verification_transition(ad, kyb, 'approve');
  PERFORM public.application_token_issue(req_co, 'activation', h_exp, 3600, ad);
  RESET ROLE;
  UPDATE public.application_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = h_exp;
  SET LOCAL ROLE service_role;
  PERFORM pg_temp.expect_error(format('select * from public.activation_claim(%L)', h_exp), 'activation:expired%');
  SELECT state INTO s FROM public.application_token_lookup(h_exp, 'activation');
  IF s <> 'expired' THEN RAISE EXCEPTION 'FAIL: expired token reads %', s; END IF;
  RAISE NOTICE 'PASS expiry enforced, KYB needs authorization evidence';

  -- Stale claim recovery: a claim older than 2 minutes that never completed may be retaken.
  INSERT INTO public.access_requests (journey, full_name, email, company_name) VALUES ('company_representative', 'New Rep', 'new.rep@t.local', 'V Company') RETURNING id INTO req_rep;
  INSERT INTO public.verification_cases (access_request_id, kind) VALUES (req_rep, 'representative') RETURNING id INTO rep;
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes)
    VALUES (rep, 'authorization_letter', rep || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 1000);
  PERFORM public.verification_transition(null, rep, 'submit');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L,null,null)', ad, rep, 'approve'), 'verification:company_required%');
  PERFORM public.verification_transition(ad, rep, 'approve', null, co);
  PERFORM public.application_token_issue(req_rep, 'activation', h_rep, 3600, ad);
  PERFORM * FROM public.activation_claim(h_rep);
  PERFORM public.activation_checkpoint(h_rep, u2);
  RESET ROLE;
  UPDATE public.application_tokens SET claimed_at = now() - interval '5 minutes' WHERE token_hash = h_rep;
  SET LOCAL ROLE service_role;
  SELECT claimed_user_id::text INTO s FROM public.activation_claim(h_rep);
  IF s IS DISTINCT FROM u2::text THEN RAISE EXCEPTION 'FAIL: recovery lost the created user (%)', s; END IF;
  PERFORM public.activation_complete(h_rep, u2, null);
  SELECT count(*) INTO n FROM public.company_members WHERE member_id = u2 AND company_id = co AND member_role = 'representative';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: representative not linked on activation'; END IF;
  SELECT role INTO s FROM public.profiles WHERE id = u2;
  IF s <> 'company' THEN RAISE EXCEPTION 'FAIL: representative role %', s; END IF;
  RAISE NOTICE 'PASS crash recovery and representative link';

  -- Rejection closes the application and revokes its links.
  INSERT INTO public.access_requests (journey, full_name, email) VALUES ('creator', 'Rejected One', 'rej@t.local') RETURNING id INTO req;
  INSERT INTO public.verification_cases (access_request_id, kind) VALUES (req, 'creator_kyc') RETURNING id INTO kyc;
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes, capture_method)
    SELECT kyc, d, kyc || '/' || gen_random_uuid() || '.jpg', 'image/jpeg', 1000, 'camera' FROM unnest(array['selfie','id_front','id_back']) d;
  PERFORM public.application_token_issue(req, 'resume', repeat('7', 64), 3600, null);
  PERFORM public.verification_transition(null, kyc, 'submit');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L,null)', ad, kyc, 'reject'), 'verification:note_required%');
  PERFORM public.verification_transition(ad, kyc, 'reject', 'Images unreadable.');
  SELECT state INTO s FROM public.application_token_lookup(repeat('7', 64), 'resume');
  IF s <> 'revoked' THEN RAISE EXCEPTION 'FAIL: resume link after rejection %', s; END IF;
  PERFORM pg_temp.expect_error(format('select public.application_token_issue(%L,%L,%L,3600,%L)', req, 'activation', repeat('8', 64), ad), 'activation:not_approved%');
  RAISE NOTICE 'PASS rejection closes the application';

  -- Existing accounts can still verify (profile-owned case).
  INSERT INTO public.verification_cases (profile_id, kind) VALUES (cr2, 'creator_kyc') RETURNING id INTO tok;
  PERFORM pg_temp.expect_error(format('select public.verification_transition(null,%L,%L)', tok, 'submit'), 'verification:not_found%');
  RESET ROLE;

  -- Clients cannot write or decide; each person reads only their own case.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', cr2), true);
  SELECT count(*) INTO n FROM public.verification_cases;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: creator reads % cases (expected own 1)', n; END IF;
  SELECT count(*) INTO n FROM public.verification_documents;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: creator reads other documents'; END IF;
  PERFORM pg_temp.expect_error('select count(*) from public.application_tokens', '%permission denied%');
  PERFORM pg_temp.expect_error('select count(*) from public.verification_reviewers', '%permission denied%');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', ad, kyb, 'approve'), '%permission denied%');
  PERFORM pg_temp.expect_error(format('select * from public.activation_claim(%L)', h_rep), '%permission denied%');
  PERFORM pg_temp.expect_error(format('update public.profiles set account_status = %L where id = %L', 'active', cr2), '%permission denied%');
  PERFORM pg_temp.expect_error(format('update public.verification_cases set status = %L where id = %L', 'approved', tok), '%permission denied%');
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', ad2), true);
  SELECT count(*) INTO n FROM public.verification_documents;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a non-reviewer admin reads % identity documents', n; END IF;
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', ad), true);
  SELECT count(*) INTO n FROM public.verification_cases;
  IF n <> 5 THEN RAISE EXCEPTION 'FAIL: reviewer sees % cases', n; END IF;
  RESET ROLE;
  SET LOCAL ROLE anon;
  PERFORM pg_temp.expect_error('select count(*) from public.verification_cases', '%permission denied%');
  PERFORM pg_temp.expect_error('select count(*) from public.application_tokens', '%permission denied%');
  RESET ROLE;
  SELECT public INTO s FROM storage.buckets WHERE id = 'verification-docs';
  IF s::boolean THEN RAISE EXCEPTION 'FAIL: documents bucket is public'; END IF;
  RAISE NOTICE 'PASS RLS, grants, reviewer allowlist and private bucket';
END $$;
ROLLBACK;

-- 0041: a fraud-flagged case needs a second, independent reviewer with their
-- own internal justification; flags follow a person through strong identity
-- fingerprints; phone matches never do; nothing bypasses this.
BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('b3000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sr-a@t.local','x',NOW(),NOW()),
  ('b3000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sr-b@t.local','x',NOW(),NOW()),
  ('b3000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sr-c@t.local','x',NOW(),NOW()),
  ('b1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sr-cr@t.local','x',NOW(),NOW());
INSERT INTO public.profiles (id, full_name, role, primary_email, account_status) VALUES
  ('b3000000-0000-0000-0000-000000000001','Reviewer A','admin','sr-a@t.local','active'),
  ('b3000000-0000-0000-0000-000000000002','Reviewer B','admin','sr-b@t.local','active'),
  ('b3000000-0000-0000-0000-000000000003','Reviewer C','admin','sr-c@t.local','active'),
  ('b1000000-0000-0000-0000-000000000001','SR Creator','creator','sr-cr@t.local','pending_verification');

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_like text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE p_like THEN RAISE NOTICE 'PASS refused: %', SQLERRM; RETURN; END IF;
    RAISE EXCEPTION 'FAIL: % raised "%", expected %', p_sql, SQLERRM, p_like;
  END;
  RAISE EXCEPTION 'FAIL: % succeeded, expected %', p_sql, p_like;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.app(p_email text, p_fp_id text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE r uuid; c uuid;
BEGIN
  INSERT INTO public.access_requests (email_verified_at, journey, full_name, email) VALUES (now(), 'creator', 'Applicant', p_email) RETURNING id INTO r;
  INSERT INTO public.verification_cases (access_request_id, kind) VALUES (r, 'creator_kyc') RETURNING id INTO c;
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes, capture_method)
  SELECT c, d, c || '/' || gen_random_uuid() || '.jpg', 'image/jpeg', 1000, 'camera' FROM unnest(array['selfie','id_front','id_back']) d;
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes) VALUES (c, 'profile_photo', c || '/' || gen_random_uuid() || '.png', 'image/png', 10);
  IF p_fp_id IS NOT NULL THEN INSERT INTO public.verification_match_keys (case_id, signal, fingerprint) VALUES (c, 'id_number', p_fp_id); END IF;
  PERFORM public.verification_transition(null, c, 'submit');
  RETURN c;
END $$;

DO $$
DECLARE n int; s text; c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; plain uuid;
  a uuid := 'b3000000-0000-0000-0000-000000000001';
  b uuid := 'b3000000-0000-0000-0000-000000000002';
  c uuid := 'b3000000-0000-0000-0000-000000000003';
  fp_id text := repeat('ab', 32);
  fp_phone text := repeat('cd', 32);
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.verification_reviewers (admin_id) VALUES (a), (b), (c);

  -- 0. A case with no flags: one reviewer approves as before, no audit row, no note needed.
  plain := pg_temp.app('plain@t.local', null);
  PERFORM public.verification_transition(a, plain, 'approve');
  SELECT count(*) INTO n FROM public.verification_flag_approvals;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: unflagged approval audited as flagged'; END IF;
  RAISE NOTICE 'PASS unflagged cases keep the ordinary single-reviewer approval';

  -- 1. The flagging reviewer cannot approve, even with a justification.
  c1 := pg_temp.app('person@t.local', fp_id);
  PERFORM public.verification_flag(a, c1, 'identity_forgery', 'Edited date of birth on the ID.');
  PERFORM public.verification_add_note(a, c1, 'My own justification.');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', a, c1, 'approve'), 'verification:second_reviewer_required%');
  -- 2. A second reviewer needs their own justification written after the flag.
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', b, c1, 'approve'), 'verification:enhanced_review_note_required%');
  -- 3. A direct UPDATE naming reviewer B (no transition) is refused, even with B's note.
  PERFORM public.verification_add_note(b, c1, 'Second review: compared with the issuing format; consistent.');
  PERFORM pg_temp.expect_error(format('update public.verification_cases set status = %L, reviewed_by = %L where id = %L', 'approved', b, c1), '%verification:approval_requires_transition%');
  -- A transition by A followed by a direct UPDATE naming B in the same transaction is refused too.
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', a, c1, 'approve'), 'verification:second_reviewer_required%');
  PERFORM pg_temp.expect_error(format('update public.verification_cases set status = %L, reviewed_by = %L where id = %L', 'approved', b, c1), '%verification:approval_requires_transition%');
  -- 4. B approves through the transition: audited with flagger, approver and justification.
  PERFORM public.verification_transition(b, c1, 'approve');
  SELECT (flagged_by = array[a]) AND approved_by = b AND justification_note_id IS NOT NULL INTO STRICT s FROM public.verification_flag_approvals WHERE case_id = c1;
  IF s <> 'true' THEN RAISE EXCEPTION 'FAIL: audit row %', s; END IF;
  SELECT count(*) INTO n FROM public.verification_events WHERE case_id = c1 AND detail::text ILIKE '%consistent%';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: the justification reached the applicant-readable history'; END IF;
  RAISE NOTICE 'PASS a second reviewer with their own justification approves; the flagger cannot; bypasses refused; audited';

  -- 5. Flags follow the person to a new email through a strong fingerprint (ID number).
  c2 := pg_temp.app('other-email@t.local', fp_id);
  SELECT flag_count INTO n FROM public.verification_enhanced_review_state(c2);
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: enhanced review not inherited through the ID fingerprint (%)', n; END IF;
  PERFORM public.verification_add_note(a, c2, 'I flagged this person before.');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', a, c2, 'approve'), 'verification:second_reviewer_required%');
  RAISE NOTICE 'PASS enhanced review follows a strong identity fingerprint across emails';

  -- 6. A shared phone number never triggers enhanced review.
  INSERT INTO public.verification_match_keys (case_id, signal, fingerprint) VALUES (c1, 'phone', fp_phone);
  c3 := pg_temp.app('shared-phone@t.local', null);
  INSERT INTO public.verification_match_keys (case_id, signal, fingerprint) VALUES (c3, 'phone', fp_phone);
  SELECT flag_count INTO n FROM public.verification_enhanced_review_state(c3);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a phone match triggered enhanced review'; END IF;
  PERFORM public.verification_transition(a, c3, 'approve');
  RAISE NOTICE 'PASS phone matches are warnings only';

  -- 7. Two flags by A and B: neither may approve; C may, with C's own note.
  c4 := pg_temp.app('two-flags@t.local', null);
  PERFORM public.verification_flag(a, c4, 'suspected_fraud', 'Mismatched selfie lighting.');
  PERFORM public.verification_flag(b, c4, 'impersonation', 'Handle belongs to another creator.');
  PERFORM public.verification_add_note(b, c4, 'B note.');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', b, c4, 'approve'), 'verification:second_reviewer_required%');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', c, c4, 'approve'), 'verification:enhanced_review_note_required%');
  PERFORM public.verification_add_note(c, c4, 'Independent review by C.');
  PERFORM public.verification_transition(c, c4, 'approve');
  SELECT flagged_by @> array[a, b] AND approved_by = c INTO STRICT s FROM public.verification_flag_approvals WHERE case_id = c4;
  IF s <> 'true' THEN RAISE EXCEPTION 'FAIL: multi-flag audit %', s; END IF;
  RAISE NOTICE 'PASS every applicable flag''s raiser is excluded from approving';

  -- 8. Rejection and information requests of a flagged case are unchanged; nothing bans.
  c5 := pg_temp.app('flag-reject@t.local', null);
  PERFORM public.verification_flag(a, c5, 'impersonation', 'Looks like an impersonation.');
  PERFORM public.verification_transition(a, c5, 'request_info', 'Please retake the ID back.');
  PERFORM public.verification_transition(null, c5, 'submit');
  PERFORM public.verification_transition(a, c5, 'reject', 'We could not verify your identity.');
  SELECT status INTO s FROM public.access_requests WHERE id = (SELECT access_request_id FROM public.verification_cases WHERE id = c5);
  IF s <> 'rejected' THEN RAISE EXCEPTION 'FAIL: rejection of a flagged case %', s; END IF;
  RAISE NOTICE 'PASS a flag does not change rejection or information requests, and bans nothing';

  -- 9. Grants: fingerprints and the audit are not writable by anyone but their paths.
  PERFORM pg_temp.expect_error(format('insert into public.verification_flag_approvals (case_id, flag_ids, flagged_by, approved_by, justification_note_id) values (%L, %L, %L, %L, 1)', c3, '{1}', array[a], b), '%permission denied%');
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', 'b1000000-0000-0000-0000-000000000001'), true);
  PERFORM pg_temp.expect_error('select count(*) from public.verification_match_keys', '%permission denied%');
  SELECT count(*) INTO n FROM public.verification_flag_approvals;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a non-reviewer reads the approval audit'; END IF;
  PERFORM pg_temp.expect_error(format('select * from public.verification_enhanced_review_state(%L)', c1), '%permission denied%');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', b, c2, 'approve'), '%permission denied%');
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', b), true);
  PERFORM pg_temp.expect_error('select count(*) from public.verification_match_keys', '%permission denied%');
  SELECT count(*) INTO n FROM public.verification_flag_approvals;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: a reviewer reads % audit rows (expected 2)', n; END IF;
  RESET ROLE;
  SET LOCAL ROLE anon;
  PERFORM pg_temp.expect_error('select count(*) from public.verification_flag_approvals', '%permission denied%');
  RESET ROLE;
  RAISE NOTICE 'PASS fingerprints are service-role only; the audit is reviewer-only and trigger-written';
END $$;
ROLLBACK;

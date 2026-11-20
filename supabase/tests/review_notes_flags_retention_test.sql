-- 0040: internal notes are reviewer-only, flags force an internal justification
-- before approval, a rejected account can reapply without being reactivated,
-- and documents cannot be purged before 365 days.
BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('a3000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','n-ad@t.local','x',NOW(),NOW()),
  ('a3000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','n-ad2@t.local','x',NOW(),NOW()),
  ('a3000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','n-ad3@t.local','x',NOW(),NOW()),
  ('a1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','n-cr@t.local','x',NOW(),NOW()),
  ('a1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','n-cr2@t.local','x',NOW(),NOW());
INSERT INTO public.profiles (id, full_name, role, primary_email, account_status) VALUES
  ('a3000000-0000-0000-0000-000000000001','N Reviewer','admin','n-ad@t.local','active'),
  ('a3000000-0000-0000-0000-000000000002','N Admin (not reviewer)','admin','n-ad2@t.local','active'),
  ('a3000000-0000-0000-0000-000000000003','N Second Reviewer','admin','n-ad3@t.local','active'),
  ('a1000000-0000-0000-0000-000000000001','N Creator','creator','n-cr@t.local','pending_verification'),
  ('a1000000-0000-0000-0000-000000000002','N Creator Two','creator','n-cr2@t.local','active');

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
DECLARE n int; s text; c1 uuid; c2 uuid; c3 uuid; req uuid; capp uuid; d_old uuid; d_new uuid; d_draft uuid; cold uuid; cdraft uuid;
  ad uuid := 'a3000000-0000-0000-0000-000000000001';
  ad2 uuid := 'a3000000-0000-0000-0000-000000000002';
  ad3 uuid := 'a3000000-0000-0000-0000-000000000003';  -- 0041: the independent second reviewer
  cr uuid := 'a1000000-0000-0000-0000-000000000001';
  cr2 uuid := 'a1000000-0000-0000-0000-000000000002';
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.verification_reviewers (admin_id) VALUES (ad), (ad3);
  INSERT INTO public.verification_cases (profile_id, kind) VALUES (cr, 'creator_kyc') RETURNING id INTO c1;
  PERFORM pg_temp.camera(c1);
  PERFORM public.verification_transition(cr, c1, 'submit');

  -- 1. Internal notes: reviewers only, explained, and never an event.
  PERFORM pg_temp.expect_error(format('select public.verification_add_note(%L,%L,%L)', ad2, c1, 'x'), 'verification:not_allowed%');
  PERFORM pg_temp.expect_error(format('select public.verification_add_note(%L,%L,%L)', cr, c1, 'x'), 'verification:not_allowed%');
  PERFORM pg_temp.expect_error(format('select public.verification_add_note(%L,%L,%L)', ad, c1, '   '), 'verification:note_required%');
  PERFORM public.verification_add_note(ad, c1, 'Internal: ID font looks inconsistent with the issue year.');
  SELECT count(*) INTO n FROM public.verification_events WHERE case_id = c1 AND detail::text ILIKE '%font%';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: note text reached the applicant-readable history'; END IF;
  PERFORM pg_temp.expect_error('insert into public.verification_notes (case_id, body) select id, ''x'' from public.verification_cases limit 1', '%permission denied%');
  PERFORM pg_temp.expect_error('update public.verification_notes set body = ''changed''', '%permission denied%');
  PERFORM pg_temp.expect_error('delete from public.verification_notes', '%permission denied%');
  RAISE NOTICE 'PASS internal notes are written only through the reviewer function and never become events';

  -- 2. Flags: explained, reviewer-only, and they gate approval on a justification.
  PERFORM pg_temp.expect_error(format('select public.verification_flag(%L,%L,%L,%L)', ad, c1, 'looks_odd', 'x'), 'verification:invalid_input%');
  PERFORM pg_temp.expect_error(format('select public.verification_flag(%L,%L,%L,%L)', ad, c1, 'identity_forgery', ''), 'verification:note_required%');
  PERFORM pg_temp.expect_error(format('select public.verification_flag(%L,%L,%L,%L)', ad2, c1, 'identity_forgery', 'x'), 'verification:not_allowed%');
  PERFORM pg_temp.expect_error('insert into public.verification_flags (case_id, subject_email, reason) select id, ''a@b.c'', ''impersonation'' from public.verification_cases limit 1', '%permission denied%');
  PERFORM public.verification_flag(ad, c1, 'identity_forgery', 'Hologram missing on the ID front.');
  SELECT subject_email INTO s FROM public.verification_flags WHERE case_id = c1;
  IF s <> 'n-cr@t.local' THEN RAISE EXCEPTION 'FAIL: flag email %', s; END IF;
  SELECT status INTO s FROM public.verification_cases WHERE id = c1;
  IF s <> 'submitted' THEN RAISE EXCEPTION 'FAIL: a flag changed the case status to %', s; END IF;
  -- The flagging reviewer may not approve at all (0041), and for a second
  -- reviewer the note written BEFORE the flag does not count.
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', ad, c1, 'approve'), 'verification:second_reviewer_required%');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', ad3, c1, 'approve'), 'verification:enhanced_review_note_required%');
  -- Rejecting a flagged case needs no extra step.
  PERFORM public.verification_transition(ad, c1, 'reject', 'We could not verify your identity document.');
  SELECT account_status INTO s FROM public.profiles WHERE id = cr;
  IF s <> 'rejected' THEN RAISE EXCEPTION 'FAIL: account after rejection %', s; END IF;
  RAISE NOTICE 'PASS flags decide nothing on their own and block approval without a justification';

  -- 3. Reapplication: a new case, pending (not active), flag carried by email.
  PERFORM pg_temp.expect_error(format('select public.verification_reapply(%L,%L)', cr, 'company_kyb'), 'verification:not_allowed%');
  PERFORM pg_temp.expect_error(format('select public.verification_reapply(%L,%L)', cr2, 'creator_kyc'), 'verification:invalid_state%');
  c2 := public.verification_reapply(cr, 'creator_kyc');
  SELECT account_status INTO s FROM public.profiles WHERE id = cr;
  IF s <> 'pending_verification' THEN RAISE EXCEPTION 'FAIL: reapplying account is % (must be pending, never active)', s; END IF;
  SELECT count(*) INTO n FROM public.verification_cases WHERE profile_id = cr;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: % cases after reapplication', n; END IF;
  SELECT status INTO s FROM public.verification_cases WHERE id = c1;
  IF s <> 'rejected' THEN RAISE EXCEPTION 'FAIL: old case history changed: %', s; END IF;
  PERFORM pg_temp.expect_error(format('select public.verification_reapply(%L,%L)', cr, 'creator_kyc'), 'verification:invalid_state%');
  PERFORM pg_temp.camera(c2);
  PERFORM public.verification_transition(cr, c2, 'submit');
  -- The earlier flag (same email) still requires a fresh justification by the approver.
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', ad, c2, 'approve'), 'verification:second_reviewer_required%');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', ad3, c2, 'approve'), 'verification:enhanced_review_note_required%');
  PERFORM public.verification_add_note(ad3, c2, 'Enhanced review: new ID checked against the issuing format; consistent.');
  PERFORM public.verification_transition(ad3, c2, 'approve');
  SELECT account_status INTO s FROM public.profiles WHERE id = cr;
  IF s <> 'active' THEN RAISE EXCEPTION 'FAIL: after a reviewer approval the account is %', s; END IF;
  -- A new application from the same email inherits enhanced review too.
  INSERT INTO public.access_requests (email_verified_at, journey, full_name, email) VALUES (now(), 'creator', 'Again', 'N-CR@t.local') RETURNING id INTO req;
  INSERT INTO public.verification_cases (access_request_id, kind) VALUES (req, 'creator_kyc') RETURNING id INTO capp;
  PERFORM pg_temp.camera(capp);
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes) VALUES (capp, 'profile_photo', capp || '/' || gen_random_uuid() || '.png', 'image/png', 10);
  PERFORM public.verification_transition(null, capp, 'submit');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', ad, capp, 'approve'), 'verification:second_reviewer_required%');
  PERFORM pg_temp.expect_error(format('select public.verification_transition(%L,%L,%L)', ad3, capp, 'approve'), 'verification:enhanced_review_note_required%');
  RAISE NOTICE 'PASS reapplication: new case, pending until a reviewer approves, enhanced review follows the person';

  -- 4. Retention: never before 365 days, whoever asks; retries and failures recorded.
  INSERT INTO public.verification_cases (profile_id, kind, status, reviewed_at) VALUES (cr2, 'creator_kyc', 'approved', now() - interval '366 days') RETURNING id INTO cold;
  INSERT INTO public.verification_documents (case_id, doc_type, storage_path, mime, size_bytes, capture_method)
    VALUES (cold, 'selfie', cold || '/' || gen_random_uuid() || '.jpg', 'image/jpeg', 1000, 'camera') RETURNING id INTO d_old;
  SELECT id INTO d_new FROM public.verification_documents WHERE case_id = c2 LIMIT 1;  -- approved just now
  PERFORM pg_temp.expect_error(format('select public.verification_purge_mark(%L)', d_new), 'retention:not_due%');
  PERFORM pg_temp.expect_error(format('update public.verification_documents set purged_at = now() where id = %L', d_new), '%retention:not_due%');
  PERFORM pg_temp.expect_error(format('update public.verification_documents set purge_confirmed_at = now() where id = %L', d_new), '%retention:not_marked%');
  -- 364 days is not enough either.
  RESET ROLE;
  UPDATE public.verification_cases SET reviewed_at = now() - interval '364 days' WHERE id = cold;
  SET LOCAL ROLE service_role;
  PERFORM pg_temp.expect_error(format('select public.verification_purge_mark(%L)', d_old), 'retention:not_due%');
  RESET ROLE;
  UPDATE public.verification_cases SET reviewed_at = now() - interval '366 days' WHERE id = cold;
  SET LOCAL ROLE service_role;
  s := public.verification_purge_mark(d_old);
  IF s NOT LIKE cold || '/%' THEN RAISE EXCEPTION 'FAIL: mark returned %', s; END IF;
  IF public.verification_purge_mark(d_old) <> s THEN RAISE EXCEPTION 'FAIL: retry returned another path'; END IF;
  SELECT count(*) INTO n FROM public.verification_events WHERE case_id = cold AND event = 'document_purged';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: % purge events (retry must not duplicate)', n; END IF;
  PERFORM public.verification_purge_failed(d_old, 'storage_503');
  SELECT count(*) INTO n FROM public.verification_events WHERE case_id = cold AND event = 'document_purge_failed' AND detail->>'code' = 'storage_503';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: failure not recorded'; END IF;
  PERFORM public.verification_purge_confirm(d_old);
  SELECT count(*) INTO n FROM public.verification_documents WHERE id = d_old AND removed_at IS NOT NULL AND purge_confirmed_at IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: purge not confirmed'; END IF;
  PERFORM pg_temp.expect_error(format('update public.verification_documents set purged_at = null where id = %L', d_old), '%retention:immutable%');
  -- Cases awaiting review are never due, however old.
  RESET ROLE;
  UPDATE public.verification_cases SET updated_at = now() - interval '900 days' WHERE id = capp;
  SET LOCAL ROLE service_role;
  SELECT id INTO d_draft FROM public.verification_documents WHERE case_id = capp LIMIT 1;
  PERFORM pg_temp.expect_error(format('select public.verification_purge_mark(%L)', d_draft), 'retention:not_due%');
  -- An abandoned draft is due after 365 days.
  INSERT INTO public.access_requests (journey, full_name, email) VALUES ('creator', 'Abandoned', 'abandoned@t.local') RETURNING id INTO req;
  INSERT INTO public.verification_cases (access_request_id, kind) VALUES (req, 'creator_kyc') RETURNING id INTO cdraft;
  PERFORM pg_temp.camera(cdraft);
  RESET ROLE;
  UPDATE public.verification_cases SET updated_at = now() - interval '366 days' WHERE id = cdraft;
  SET LOCAL ROLE service_role;
  SELECT id INTO d_draft FROM public.verification_documents WHERE case_id = cdraft LIMIT 1;
  PERFORM public.verification_purge_mark(d_draft);
  RAISE NOTICE 'PASS retention: 365 days enforced in the database, retries idempotent, failures recorded';
  RESET ROLE;

  -- 5. Clients: the subject never reads notes or flags; reviewers do; nobody writes.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', cr), true);
  SELECT count(*) INTO n FROM public.verification_notes;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: the subject reads % internal notes', n; END IF;
  SELECT count(*) INTO n FROM public.verification_flags;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: the subject reads % flags', n; END IF;
  SELECT count(*) INTO n FROM public.verification_cases WHERE profile_id = cr;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: the subject should still read both own cases, got %', n; END IF;
  PERFORM pg_temp.expect_error(format('select public.verification_add_note(%L,%L,%L)', ad, c1, 'x'), '%permission denied%');
  PERFORM pg_temp.expect_error(format('select public.verification_reapply(%L,%L)', cr, 'creator_kyc'), '%permission denied%');
  PERFORM pg_temp.expect_error(format('select public.verification_purge_mark(%L)', d_old), '%permission denied%');
  PERFORM pg_temp.expect_error('insert into public.verification_notes (case_id, body) select id, ''x'' from public.verification_cases limit 1', '%permission denied%');
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', ad2), true);
  SELECT count(*) INTO n FROM public.verification_notes;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a non-reviewer admin reads notes'; END IF;
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', ad), true);
  SELECT count(*) INTO n FROM public.verification_notes;
  IF n < 3 THEN RAISE EXCEPTION 'FAIL: the reviewer reads % notes', n; END IF;
  SELECT count(*) INTO n FROM public.verification_flags;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: the reviewer reads % flags', n; END IF;
  RESET ROLE;
  SET LOCAL ROLE anon;
  PERFORM pg_temp.expect_error('select count(*) from public.verification_notes', '%permission denied%');
  PERFORM pg_temp.expect_error('select count(*) from public.verification_flags', '%permission denied%');
  RESET ROLE;
  RAISE NOTICE 'PASS notes and flags: reviewer-only reads, no client writes';
END $$;
ROLLBACK;

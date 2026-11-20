-- ---------------------------------------------------------------------------
-- 0026 collaboration lifecycle — end-to-end state machine and access test.
--
--   psql "$DATABASE_URL" -f supabase/tests/collaboration_lifecycle_test.sql
--
-- Runs in a transaction and rolls back. Every refusal is asserted by its
-- 'collab:<code>' message; reads are asserted by row counts under RLS.
-- ---------------------------------------------------------------------------
BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('c1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cr1@t.local','x',NOW(),NOW()),
  ('c1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cr2@t.local','x',NOW(),NOW()),
  ('c2000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','co1@t.local','x',NOW(),NOW()),
  ('c2000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','co2@t.local','x',NOW(),NOW()),
  ('c3000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ad@t.local','x',NOW(),NOW());
INSERT INTO public.profiles (id, full_name, role, primary_email) VALUES
  ('c1000000-0000-0000-0000-000000000001','Creator One','creator','cr1@t.local'),
  ('c1000000-0000-0000-0000-000000000002','Creator Two','creator','cr2@t.local'),
  ('c2000000-0000-0000-0000-000000000001','Company One','company','co1@t.local'),
  ('c2000000-0000-0000-0000-000000000002','Company Two','company','co2@t.local'),
  ('c3000000-0000-0000-0000-000000000001','Admin','admin','ad@t.local');

-- Briefs are written by the server.
SET LOCAL ROLE service_role;
INSERT INTO public.briefs (id, company_id, title, description, status, published_at) VALUES
  ('b0000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001','Launch video','A dedicated review of our new app.','published', now()),
  ('b0000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000001','Secret draft','Not ready for creators yet.','draft', null);
RESET ROLE;

CREATE TEMP TABLE ids (k text primary key, v uuid);
GRANT ALL ON ids TO service_role, authenticated;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_code text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE p_code || '%' THEN RAISE NOTICE 'PASS refused with %', p_code; RETURN; END IF;
    RAISE EXCEPTION 'FAIL: % raised "%", expected %', p_sql, SQLERRM, p_code;
  END;
  RAISE EXCEPTION 'FAIL: % succeeded, expected %', p_sql, p_code;
END $$;

DO $$
DECLARE n int; v uuid; s text;
  co1 uuid := 'c2000000-0000-0000-0000-000000000001';
  co2 uuid := 'c2000000-0000-0000-0000-000000000002';
  cr1 uuid := 'c1000000-0000-0000-0000-000000000001';
  cr2 uuid := 'c1000000-0000-0000-0000-000000000002';
  pub uuid := 'b0000000-0000-0000-0000-000000000001';
  dft uuid := 'b0000000-0000-0000-0000-000000000002';
  inv uuid; col uuid; del uuid; chat uuid;
BEGIN
  SET LOCAL ROLE service_role;

  -- Invitations: only on the company's own published brief, to a real creator, once.
  PERFORM pg_temp.expect_error(format('select public.collab_create_invitation(%L,%L,%L,%L,500)', co2, pub, cr1, 'hello'), 'collab:not_found');
  PERFORM pg_temp.expect_error(format('select public.collab_create_invitation(%L,%L,%L,%L,500)', co1, dft, cr1, 'hello'), 'collab:brief_not_published');
  PERFORM pg_temp.expect_error(format('select public.collab_create_invitation(%L,%L,%L,%L,500)', co1, pub, co2, 'hello'), 'collab:creator_not_found');
  inv := public.collab_create_invitation(co1, pub, cr1, 'Would you review our app?', 500);
  PERFORM pg_temp.expect_error(format('select public.collab_create_invitation(%L,%L,%L,%L,500)', co1, pub, cr1, 'again'), 'collab:already_invited');

  -- Only the invited creator responds; changes need a note; the company revises.
  PERFORM pg_temp.expect_error(format('select public.collab_respond_invitation(%L,%L,%L,null)', cr2, inv, 'accept'), 'collab:not_found');
  PERFORM pg_temp.expect_error(format('select public.collab_respond_invitation(%L,%L,%L,null)', cr1, inv, 'request_changes'), 'collab:note_required');
  PERFORM public.collab_respond_invitation(cr1, inv, 'request_changes', 'Please raise the budget.');
  PERFORM pg_temp.expect_error(format('select public.collab_respond_invitation(%L,%L,%L,null)', cr1, inv, 'accept'), 'collab:invalid_state');
  PERFORM public.collab_revise_invitation(co1, inv, 'Raised to 700.', 700);
  col := public.collab_respond_invitation(cr1, inv, 'accept', null);
  IF col IS NULL THEN RAISE EXCEPTION 'FAIL: accept returned no collaboration'; END IF;
  SELECT deal_chat_id INTO chat FROM public.collaborations WHERE id = col;
  SELECT deal_status INTO s FROM public.deal_chats WHERE id = chat;
  IF s <> 'negotiating' THEN RAISE EXCEPTION 'FAIL: deal room status %', s; END IF;
  RAISE NOTICE 'PASS accept opens a collaboration and a negotiating deal room';
  PERFORM pg_temp.expect_error(format('select public.collab_withdraw_invitation(%L,%L)', co1, inv), 'collab:invalid_state');

  -- Terms: no confirmation without terms; a new proposal resets confirmations.
  PERFORM pg_temp.expect_error(format('select public.collab_confirm_terms(%L,%L)', co1, col), 'collab:no_terms');
  PERFORM pg_temp.expect_error(format('select public.collab_propose_terms(%L,%L,700,%L)', co2, col, 'one video, 60 days usage'), 'collab:not_found');
  PERFORM public.collab_propose_terms(co1, col, 700, 'One dedicated video, 60 days of usage rights.');
  s := public.collab_confirm_terms(co1, col);
  IF s <> 'negotiating' THEN RAISE EXCEPTION 'FAIL: one confirmation activated'; END IF;
  PERFORM public.collab_propose_terms(cr1, col, 800, 'One dedicated video, 30 days of usage rights.');
  SELECT count(*) INTO n FROM public.collaborations WHERE id = col AND company_confirmed_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: counter-proposal kept the old confirmation'; END IF;
  RAISE NOTICE 'PASS a new proposal clears earlier confirmations';

  -- Deliverables can be prepared while negotiating, but not submitted.
  del := public.collab_add_deliverable(co1, col, 'Review video', 'Ten minutes, link in description.', current_date + 14);
  PERFORM pg_temp.expect_error(format('select public.collab_add_deliverable(%L,%L,%L,null,null)', cr1, col, 'x video'), 'collab:not_found');
  PERFORM pg_temp.expect_error(format('select public.collab_submit_deliverable(%L,%L,%L,null)', cr1, del, 'https://youtu.be/x'), 'collab:not_active');

  PERFORM public.collab_confirm_terms(cr1, col);
  s := public.collab_confirm_terms(co1, col);
  IF s <> 'active' THEN RAISE EXCEPTION 'FAIL: both confirmations did not activate (%)', s; END IF;
  SELECT deal_status INTO s FROM public.deal_chats WHERE id = chat;
  IF s <> 'agreed' THEN RAISE EXCEPTION 'FAIL: deal room not agreed (%)', s; END IF;
  SELECT count(*) INTO n FROM public.collaborations WHERE id = col AND agreed_amount_usd = 800 AND agreed_terms LIKE '%30 days%';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: agreed terms not frozen'; END IF;
  RAISE NOTICE 'PASS both confirmations freeze the terms and mark the deal room agreed';
  PERFORM pg_temp.expect_error(format('select public.collab_propose_terms(%L,%L,900,%L)', cr1, col, 'changing my mind now'), 'collab:invalid_state');

  -- Submission, revision, resubmission, approval, completion.
  PERFORM pg_temp.expect_error(format('select public.collab_submit_deliverable(%L,%L,null,null)', cr1, del), 'collab:invalid_input');
  PERFORM pg_temp.expect_error(format('select public.collab_complete(%L,%L)', co1, col), 'collab:deliverables_open');
  PERFORM public.collab_submit_deliverable(cr1, del, 'https://youtu.be/abc', 'Draft cut');
  PERFORM pg_temp.expect_error(format('select public.collab_review_deliverable(%L,%L,%L,null)', co1, del, 'revise'), 'collab:note_required');
  PERFORM pg_temp.expect_error(format('select public.collab_review_deliverable(%L,%L,%L,null)', cr1, del, 'approve'), 'collab:not_found');
  PERFORM public.collab_review_deliverable(co1, del, 'revise', 'Please mention the price.');
  PERFORM pg_temp.expect_error(format('select public.collab_remove_deliverable(%L,%L)', co1, del), 'collab:invalid_state');
  PERFORM public.collab_submit_deliverable(cr1, del, 'https://youtu.be/abc2', null);
  PERFORM public.collab_review_deliverable(co1, del, 'approve', null);
  SELECT revision_count INTO n FROM public.deliverables WHERE id = del;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: revision count %', n; END IF;
  PERFORM pg_temp.expect_error(format('select public.collab_complete(%L,%L)', cr1, col), 'collab:not_found');
  PERFORM public.collab_complete(co1, col);
  PERFORM pg_temp.expect_error(format('select public.collab_cancel(%L,%L,%L)', cr1, col, 'too late'), 'collab:invalid_state');
  RAISE NOTICE 'PASS submit, revise, resubmit, approve and complete';

  SELECT count(*) INTO n FROM public.collaboration_events WHERE collaboration_id = col OR invitation_id = inv;
  IF n < 14 THEN RAISE EXCEPTION 'FAIL: only % events recorded', n; END IF;
  RAISE NOTICE 'PASS % history events recorded', n;

  -- History is append-only, even for the server.
  PERFORM pg_temp.expect_error('update public.collaboration_events set event_type = event_type', 'permission denied');
  PERFORM pg_temp.expect_error('delete from public.collaboration_events', 'permission denied');
  RESET ROLE;

  INSERT INTO ids VALUES ('inv', inv), ('col', col), ('del', del);
END $$;

-- Access under RLS ------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  -- Company One: both its briefs, its invitation and collaboration.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"c2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.briefs; IF n <> 2 THEN RAISE EXCEPTION 'FAIL: company1 briefs %', n; END IF;
  SELECT count(*) INTO n FROM public.collaborations; IF n <> 1 THEN RAISE EXCEPTION 'FAIL: company1 collabs %', n; END IF;
  RESET ROLE;

  -- Company Two: nothing of Company One's, not even the published brief.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"c2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.briefs; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: company2 sees % briefs', n; END IF;
  SELECT count(*) INTO n FROM public.invitations; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: company2 sees invitations'; END IF;
  SELECT count(*) INTO n FROM public.collaboration_events; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: company2 sees events'; END IF;
  RESET ROLE;

  -- Creator Two: the published brief only; no draft, invitation, collaboration or deliverable.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.briefs; IF n <> 1 THEN RAISE EXCEPTION 'FAIL: creator2 briefs %', n; END IF;
  SELECT count(*) INTO n FROM public.briefs WHERE status = 'draft'; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: creator sees a draft'; END IF;
  SELECT count(*) INTO n FROM public.invitations; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: creator2 sees invitations'; END IF;
  SELECT count(*) INTO n FROM public.deliverables; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: creator2 sees deliverables'; END IF;
  RESET ROLE;

  -- Creator One: their invitation, collaboration, deliverable and history.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.deliverables; IF n <> 1 THEN RAISE EXCEPTION 'FAIL: creator1 deliverables %', n; END IF;
  SELECT count(*) INTO n FROM public.collaboration_events; IF n < 14 THEN RAISE EXCEPTION 'FAIL: creator1 events %', n; END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS each party sees only its own records';
END $$;

-- Signed-in users cannot write or call the transition functions directly.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"c2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  BEGIN
    INSERT INTO public.briefs (company_id, title, description) VALUES ('c2000000-0000-0000-0000-000000000001', 'Direct', 'Written from the browser');
    RAISE EXCEPTION 'FAIL: authenticated inserted a brief';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS authenticated cannot insert briefs';
  END;
  BEGIN
    UPDATE public.collaborations SET status = 'completed';
    RAISE EXCEPTION 'FAIL: authenticated updated a collaboration';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS authenticated cannot update collaborations';
  END;
  BEGIN
    PERFORM public.collab_complete('c2000000-0000-0000-0000-000000000001', (SELECT v FROM ids WHERE k = 'col'));
    RAISE EXCEPTION 'FAIL: authenticated executed a transition function';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS authenticated cannot execute transitions';
  END;
  RESET ROLE;

  SET LOCAL ROLE anon;
  BEGIN
    PERFORM count(*) FROM public.briefs;
    RAISE EXCEPTION 'FAIL: anon read briefs';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS anon cannot read briefs';
  END;
  RESET ROLE;
END $$;

-- Integrity: an invitation cannot point at another company's brief.
DO $$
BEGIN
  INSERT INTO public.invitations (brief_id, company_id, creator_id, message)
  VALUES ('b0000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'x');
  RAISE EXCEPTION 'FAIL: cross-company invitation accepted';
EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS invitation must match its brief''s company';
END $$;

ROLLBACK;

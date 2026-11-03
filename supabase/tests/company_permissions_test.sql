-- 0034: representative scopes: least privilege, owner-only grants, no
-- cross-company access, immediate revocation, DB-level enforcement.
BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) VALUES
  ('a5000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coa@t.local','x',NOW(),NOW()),
  ('a5000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cob@t.local','x',NOW(),NOW()),
  ('a5000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','repa@t.local','x',NOW(),NOW()),
  ('a5000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','repb@t.local','x',NOW(),NOW()),
  ('a5000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cr@t.local','x',NOW(),NOW()),
  ('a5000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ad@t.local','x',NOW(),NOW());
INSERT INTO public.profiles (id, full_name, role, primary_email) VALUES
  ('a5000000-0000-0000-0000-000000000001','Company A','company','coa@t.local'),
  ('a5000000-0000-0000-0000-000000000002','Company B','company','cob@t.local'),
  ('a5000000-0000-0000-0000-000000000003','Rep of A','company','repa@t.local'),
  ('a5000000-0000-0000-0000-000000000004','Rep of B','company','repb@t.local'),
  ('a5000000-0000-0000-0000-000000000005','A Creator','creator','cr@t.local'),
  ('a5000000-0000-0000-0000-000000000006','Admin','admin','ad@t.local');
INSERT INTO public.company_members (member_id, company_id, member_role) VALUES
  ('a5000000-0000-0000-0000-000000000003','a5000000-0000-0000-0000-000000000001','representative'),
  ('a5000000-0000-0000-0000-000000000004','a5000000-0000-0000-0000-000000000002','representative');
INSERT INTO public.briefs (company_id, title, description) VALUES
  ('a5000000-0000-0000-0000-000000000001','A brief','Brief of company A, draft.'),
  ('a5000000-0000-0000-0000-000000000002','B brief','Brief of company B, draft.');

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_like text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE p_like THEN RAISE NOTICE 'PASS refused: %', SQLERRM; RETURN; END IF;
    RAISE EXCEPTION 'FAIL: % raised "%", expected %', p_sql, SQLERRM, p_like;
  END;
  RAISE EXCEPTION 'FAIL: % succeeded, expected %', p_sql, p_like;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p), true); END $$;

DO $$
DECLARE n int;
  coa uuid := 'a5000000-0000-0000-0000-000000000001'; cob uuid := 'a5000000-0000-0000-0000-000000000002';
  repa uuid := 'a5000000-0000-0000-0000-000000000003'; repb uuid := 'a5000000-0000-0000-0000-000000000004';
  cr uuid := 'a5000000-0000-0000-0000-000000000005'; ad uuid := 'a5000000-0000-0000-0000-000000000006';
BEGIN
  -- Least privilege: a link alone grants nothing.
  SET LOCAL ROLE authenticated; PERFORM pg_temp.as_user(repa);
  SELECT count(*) INTO n FROM public.briefs; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: unscoped rep reads % briefs', n; END IF;
  SELECT count(*) INTO n FROM public.creator_directory(); IF n <> 0 THEN RAISE EXCEPTION 'FAIL: unscoped rep searches creators'; END IF;
  PERFORM pg_temp.as_user(coa);
  SELECT count(*) INTO n FROM public.creator_directory(); IF n <> 1 THEN RAISE EXCEPTION 'FAIL: company owner directory (%)', n; END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS a link grants nothing by default';

  SET LOCAL ROLE service_role;
  -- Only the company itself (or an admin) grants; never another company, the rep, or a creator.
  PERFORM pg_temp.expect_error(format('select public.company_set_scope(%L,%L,%L,true)', cob, repa, 'briefs.view'), 'perm:not_allowed%');
  PERFORM pg_temp.expect_error(format('select public.company_set_scope(%L,%L,%L,true)', repa, repa, 'briefs.view'), 'perm:not_allowed%');
  PERFORM pg_temp.expect_error(format('select public.company_set_scope(%L,%L,%L,true)', cr, repa, 'briefs.view'), 'perm:not_allowed%');
  PERFORM pg_temp.expect_error(format('select public.company_set_scope(%L,%L,%L,true)', coa, repb, 'briefs.view'), 'perm:not_allowed%');
  PERFORM pg_temp.expect_error(format('select public.company_set_scope(%L,%L,%L,true)', coa, coa, 'briefs.view'), 'perm:not_found%');
  -- Financial or contractual scopes need owner approval; unbuilt ones cannot be granted.
  PERFORM pg_temp.expect_error(format('select public.company_set_scope(%L,%L,%L,true)', coa, repa, 'deals.financial'), 'perm:approval_required%');
  PERFORM pg_temp.expect_error(format('select public.company_set_scope(%L,%L,%L,true)', coa, repa, 'invitations.send'), 'perm:approval_required%');
  PERFORM pg_temp.expect_error(format('select public.company_set_scope(%L,%L,%L,true)', coa, repa, 'briefs.create'), 'perm:not_available%');
  PERFORM pg_temp.expect_error(format('select public.company_set_scope(%L,%L,%L,true)', coa, repa, 'made.up'), 'perm:not_available%');
  PERFORM public.company_set_scope(coa, repa, 'briefs.view', true);
  PERFORM public.company_set_scope(coa, repa, 'discovery.view', true);
  PERFORM public.company_set_scope(coa, repa, 'briefs.view', true); -- idempotent
  SELECT count(*) INTO n FROM public.company_permission_events WHERE member_id = repa AND action = 'grant';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: % grant events', n; END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS only the company grants, gated and unbuilt scopes refused, history kept';

  -- Enforced in the database: own company's briefs only; directory with the scope.
  SET LOCAL ROLE authenticated; PERFORM pg_temp.as_user(repa);
  SELECT count(*) INTO n FROM public.briefs; IF n <> 1 THEN RAISE EXCEPTION 'FAIL: scoped rep reads % briefs', n; END IF;
  SELECT count(*) INTO n FROM public.briefs WHERE company_id = cob; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: rep of A reads company B'; END IF;
  SELECT count(*) INTO n FROM public.creator_directory(); IF n <> 1 THEN RAISE EXCEPTION 'FAIL: scoped rep directory (%)', n; END IF;
  PERFORM pg_temp.expect_error(format('update public.briefs set title = %L where company_id = %L', 'x', coa), '%permission denied%');
  PERFORM pg_temp.expect_error(format('insert into public.company_member_scopes (member_id, company_id, scope) values (%L,%L,%L)', repa, coa, 'company.edit'), '%permission denied%');
  PERFORM pg_temp.expect_error(format('select public.company_set_scope(%L,%L,%L,true)', coa, repa, 'company.edit'), '%permission denied%');
  -- The other company's rep sees nothing of A.
  PERFORM pg_temp.as_user(repb);
  SELECT count(*) INTO n FROM public.briefs; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: rep of B reads briefs'; END IF;
  SELECT count(*) INTO n FROM public.company_member_scopes; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: rep of B reads A''s grants'; END IF;
  PERFORM pg_temp.as_user(cob);
  SELECT count(*) INTO n FROM public.company_permission_events; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: company B reads A''s history'; END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS enforced by RLS and the directory; no cross-company access';

  -- Revocation takes effect on the very next query.
  SET LOCAL ROLE service_role;
  PERFORM public.company_set_scope(coa, repa, 'briefs.view', false);
  RESET ROLE;
  SET LOCAL ROLE authenticated; PERFORM pg_temp.as_user(repa);
  SELECT count(*) INTO n FROM public.briefs; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: revoked rep still reads briefs'; END IF;
  RESET ROLE;
  -- Re-linking to another company drops the remaining scopes.
  UPDATE public.company_members SET company_id = cob WHERE member_id = repa;
  SELECT count(*) INTO n FROM public.company_member_scopes WHERE member_id = repa; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: scopes survived relink'; END IF;
  SELECT count(*) INTO n FROM public.company_permission_events WHERE member_id = repa AND action = 'cleared_on_relink'; IF n <> 1 THEN RAISE EXCEPTION 'FAIL: relink not recorded'; END IF;
  SELECT count(*) INTO n FROM public.company_permission_events WHERE member_id = repa AND action = 'revoke'; IF n <> 1 THEN RAISE EXCEPTION 'FAIL: revoke not recorded'; END IF;
  -- An admin may grant too.
  SET LOCAL ROLE service_role;
  PERFORM public.company_set_scope(ad, repa, 'company.view', true);
  RESET ROLE;
  RAISE NOTICE 'PASS immediate revocation, relink clears scopes, audit complete';
END $$;
ROLLBACK;

-- 0041 verification (read-only). Every row must say ok.
select 'match keys: no client access' as check_name,
  case when (select relrowsecurity from pg_class where oid = 'public.verification_match_keys'::regclass)
        and not has_table_privilege('authenticated', 'public.verification_match_keys', 'select')
        and not has_table_privilege('anon', 'public.verification_match_keys', 'select') then 'ok' else 'EXPOSED' end as result
union all
select 'approval audit: reviewer-only, trigger-written',
  case when (select relrowsecurity from pg_class where oid = 'public.verification_flag_approvals'::regclass)
        and not has_table_privilege('authenticated', 'public.verification_flag_approvals', 'insert')
        and not has_table_privilege('service_role', 'public.verification_flag_approvals', 'insert') then 'ok' else 'EXPOSED' end
union all
select 'transition records its actor',
  case when pg_get_functiondef('public.verification_transition(uuid,uuid,text,text,uuid)'::regprocedure) like '%gl.verification_actor%' then 'ok' else 'MISSING' end
union all
select 'guard enforces a second reviewer',
  case when pg_get_functiondef('private.verification_submit_guard()'::regprocedure) like '%second_reviewer_required%'
        and pg_get_functiondef('private.verification_submit_guard()'::regprocedure) like '%approval_requires_transition%' then 'ok' else 'MISSING' end
union all
select 'state function service-role only',
  case when not has_function_privilege('authenticated', 'public.verification_enhanced_review_state(uuid)', 'execute')
        and has_function_privilege('service_role', 'public.verification_enhanced_review_state(uuid)', 'execute') then 'ok' else 'EXPOSED' end;

-- 0039 verification (read-only). Every row must say ok.
select 'email_verified_at column' as check_name,
  case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'access_requests' and column_name = 'email_verified_at') then 'ok' else 'MISSING' end as result
union all
select 'profile_photo doc type',
  case when pg_get_constraintdef((select oid from pg_constraint where conname = 'verification_documents_doc_type_check')) like '%profile_photo%' then 'ok' else 'MISSING' end
union all
select 'profile photo is image',
  case when exists (select 1 from pg_constraint where conname = 'verification_profile_photo_is_image') then 'ok' else 'MISSING' end
union all
select 'email_verified event',
  case when pg_get_constraintdef((select oid from pg_constraint where conname = 'verification_events_event_check')) like '%email_verified%' then 'ok' else 'MISSING' end
union all
select 'submit guard trigger',
  case when exists (select 1 from pg_trigger where tgname = 'verification_submit_guard' and tgrelid = 'public.verification_cases'::regclass and not tgisinternal) then 'ok' else 'MISSING' end
union all
select 'guard not executable by clients',
  case when not has_function_privilege('authenticated', 'private.verification_submit_guard()', 'execute')
        and not has_function_privilege('anon', 'private.verification_submit_guard()', 'execute') then 'ok' else 'EXPOSED' end
union all
select 'token functions service-role only',
  case when not has_function_privilege('authenticated', 'public.application_token_issue(uuid,text,text,integer,uuid)', 'execute')
        and not has_function_privilege('anon', 'public.application_token_lookup(text,text)', 'execute') then 'ok' else 'EXPOSED' end;

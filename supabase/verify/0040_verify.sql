-- 0040 verification (read-only). Every row must say ok.
select 'notes table, RLS on' as check_name,
  case when (select relrowsecurity from pg_class where oid = 'public.verification_notes'::regclass) then 'ok' else 'MISSING' end as result
union all
select 'flags table, RLS on',
  case when (select relrowsecurity from pg_class where oid = 'public.verification_flags'::regclass) then 'ok' else 'MISSING' end
union all
select 'no client writes on notes/flags',
  case when not has_table_privilege('authenticated', 'public.verification_notes', 'insert')
        and not has_table_privilege('authenticated', 'public.verification_flags', 'insert')
        and not has_table_privilege('service_role', 'public.verification_notes', 'insert')
        and not has_table_privilege('service_role', 'public.verification_notes', 'update')
        and not has_table_privilege('anon', 'public.verification_notes', 'select') then 'ok' else 'EXPOSED' end
union all
select 'review functions service-role only',
  case when not has_function_privilege('authenticated', 'public.verification_add_note(uuid,uuid,text)', 'execute')
        and not has_function_privilege('authenticated', 'public.verification_flag(uuid,uuid,text,text)', 'execute')
        and not has_function_privilege('authenticated', 'public.verification_reapply(uuid,text)', 'execute')
        and not has_function_privilege('authenticated', 'public.verification_purge_mark(uuid)', 'execute')
        and has_function_privilege('service_role', 'public.verification_purge_mark(uuid)', 'execute') then 'ok' else 'EXPOSED' end
union all
select 'purge guard trigger',
  case when exists (select 1 from pg_trigger where tgname = 'verification_documents_purge_guard' and not tgisinternal) then 'ok' else 'MISSING' end
union all
select 'purge columns',
  case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'verification_documents' and column_name in ('purged_at', 'purge_confirmed_at')) = 2 then 'ok' else 'MISSING' end
union all
select 'one open case per kind (rejected excluded)',
  case when pg_get_indexdef('public.verification_cases_one_per_kind'::regclass) ilike '%status <> ''rejected''%' then 'ok' else 'MISSING' end
union all
select 'purge failure event',
  case when pg_get_constraintdef((select oid from pg_constraint where conname = 'verification_events_event_check')) like '%document_purge_failed%' then 'ok' else 'MISSING' end;

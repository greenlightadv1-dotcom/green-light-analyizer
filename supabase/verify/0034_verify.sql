-- Read-only checks for 0034. Every ok must be true.
select 'tables exist', to_regclass('public.company_member_scopes') is not null and to_regclass('public.company_permission_events') is not null;
select 'RLS on', bool_and(relrowsecurity) from pg_class where oid in ('public.company_member_scopes'::regclass, 'public.company_permission_events'::regclass);
select 'clients cannot write scopes', not (has_table_privilege('authenticated','public.company_member_scopes','insert') or has_table_privilege('authenticated','public.company_member_scopes','delete'));
select 'grant function not executable by clients', not has_function_privilege('authenticated','public.company_set_scope(uuid,uuid,text,boolean)','execute');
select 'no gated scope granted', not exists (select 1 from public.company_member_scopes where scope in ('invitations.send','deals.financial','members.manage'));
select 'directory still not executable by anon', not has_function_privilege('anon','public.creator_directory()','execute');

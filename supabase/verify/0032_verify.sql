-- Read-only checks for 0032. Every ok must be true.
select 'tables exist', to_regclass('public.verification_cases') is not null and to_regclass('public.verification_documents') is not null and to_regclass('public.verification_events') is not null;
select 'RLS on', bool_and(relrowsecurity) from pg_class where oid in ('public.verification_cases'::regclass,'public.verification_documents'::regclass,'public.verification_events'::regclass);
select 'authenticated cannot write', not (has_table_privilege('authenticated','public.verification_cases','update') or has_table_privilege('authenticated','public.verification_documents','insert'));
select 'account_status not client-writable', not has_column_privilege('authenticated','public.profiles','account_status','update');
select 'transition not executable by clients', not has_function_privilege('authenticated','public.verification_transition(uuid,uuid,text,text,uuid)','execute');
select 'documents bucket private', exists (select 1 from storage.buckets where id='verification-docs' and not public);
select 'existing accounts active', not exists (select 1 from public.profiles where account_status is null);

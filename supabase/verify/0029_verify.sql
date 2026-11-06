-- Read-only checks for 0029 (content planning). Every `ok` must be true.
--   psql "$DATABASE_URL" -F'|' -At -f supabase/verify/0029_verify.sql
select 'content_items exists', to_regclass('public.content_items') is not null;
select 'RLS on content_items', relrowsecurity from pg_class where oid = 'public.content_items'::regclass;
select 'anon cannot read', not has_table_privilege('anon', 'public.content_items', 'select');
select 'authenticated cannot write', not (has_table_privilege('authenticated', 'public.content_items', 'insert')
  or has_table_privilege('authenticated', 'public.content_items', 'update') or has_table_privilege('authenticated', 'public.content_items', 'delete'));
select 'owner-only policy', exists (select 1 from pg_policies where tablename = 'content_items' and qual like '%creator_id%auth.uid()%' and qual not like '%is_admin%');
select 'trigger installed', exists (select 1 from pg_trigger where tgname = 'content_items_check' and not tgisinternal);

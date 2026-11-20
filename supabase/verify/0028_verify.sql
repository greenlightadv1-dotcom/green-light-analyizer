-- Read-only checks for 0028 (shortlists, portfolio, visibility). Every `ok` must be true.
--   psql "$DATABASE_URL" -F'|' -At -f supabase/verify/0028_verify.sql
select 'tables exist', to_regclass('public.shortlists') is not null and to_regclass('public.shortlist_entries') is not null
  and to_regclass('public.portfolio_items') is not null and to_regclass('public.public_profile_settings') is not null;
select 'RLS on all four', bool_and(relrowsecurity) from pg_class
  where oid in ('public.shortlists'::regclass, 'public.shortlist_entries'::regclass, 'public.portfolio_items'::regclass, 'public.public_profile_settings'::regclass);
select 'anon reads none of the tables', not (has_table_privilege('anon', 'public.shortlists', 'select')
  or has_table_privilege('anon', 'public.portfolio_items', 'select') or has_table_privilege('anon', 'public.public_profile_settings', 'select'));
select 'authenticated writes none of the tables', not (has_table_privilege('authenticated', 'public.shortlists', 'insert')
  or has_table_privilege('authenticated', 'public.shortlist_entries', 'insert') or has_table_privilege('authenticated', 'public.portfolio_items', 'update')
  or has_table_privilege('authenticated', 'public.public_profile_settings', 'update'));
select 'public portfolio RPC executable by anon', has_function_privilege('anon', 'public.creator_public_portfolio(text)', 'execute');
select 'public profile RPC executable by anon', has_function_privilege('anon', 'public.creator_public_profile(text)', 'execute');
select 'triggers installed', (select count(*) from pg_trigger where not tgisinternal
  and tgname in ('shortlists_check', 'shortlist_entries_check', 'portfolio_items_check')) = 3;
select 'shortlists are owner-only', exists (select 1 from pg_policies where tablename = 'shortlists' and qual like '%company_id%auth.uid()%' and qual not like '%is_admin%');

-- Read-only checks for 0025. Every `ok` must be true.
select 'table exists' as check, to_regclass('public.media_kit_snapshots') is not null as ok
union all select 'rls enabled', relrowsecurity from pg_class where oid = 'public.media_kit_snapshots'::regclass
union all select 'one select policy, no write policy',
  (select count(*) = 1 from pg_policies where schemaname = 'public' and tablename = 'media_kit_snapshots' and cmd = 'SELECT')
  and (select count(*) = 0 from pg_policies where schemaname = 'public' and tablename = 'media_kit_snapshots' and cmd <> 'SELECT')
union all select 'anon has no privileges', not has_table_privilege('anon', 'public.media_kit_snapshots', 'select,insert,update,delete')
union all select 'authenticated: select only',
  has_table_privilege('authenticated', 'public.media_kit_snapshots', 'select')
  and not has_table_privilege('authenticated', 'public.media_kit_snapshots', 'insert,update,delete')
union all select 'one snapshot per kit per day', exists (
  select 1 from pg_constraint where conname = 'media_kit_snapshots_one_per_day')
union all select 'source restricted to official APIs', exists (
  select 1 from pg_constraint where conrelid = 'public.media_kit_snapshots'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) like '%youtube_data_api%');

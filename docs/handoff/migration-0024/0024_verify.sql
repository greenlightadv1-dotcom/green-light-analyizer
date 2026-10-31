-- 0024 POST-APPLICATION VERIFICATION — read-only. Run AFTER the migration.
-- Every row should show ok = true.

with checks(check_name, ok) as (
  select 'profiles: 5 new columns', count(*) = 5
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name in ('creator_categories', 'creator_games', 'content_formats', 'company_website', 'company_industry')
  union all
  select 'profiles: 5 size constraints', count(*) = 5
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and conname in ('profiles_creator_categories_len', 'profiles_creator_games_len', 'profiles_content_formats_len',
                    'profiles_company_website_len', 'profiles_company_industry_len')
  union all
  select 'profiles: 2 GIN indexes', count(*) = 2
  from pg_indexes
  where schemaname = 'public' and tablename = 'profiles'
    and indexname in ('profiles_creator_categories_gin', 'profiles_creator_games_gin')
  union all
  select 'profiles: new columns NOT writable by authenticated',
    not has_column_privilege('authenticated', 'public.profiles', 'creator_categories', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.profiles', 'company_website', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.profiles', 'company_industry', 'UPDATE')
  union all
  select 'access_requests: table exists with RLS on',
    coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.access_requests')), false)
  union all
  select 'access_requests: no policies (deny by default)', count(*) = 0
  from pg_policies where schemaname = 'public' and tablename = 'access_requests'
  union all
  select 'access_requests: anon and authenticated have no access',
    not has_table_privilege('anon', 'public.access_requests', 'SELECT')
    and not has_table_privilege('anon', 'public.access_requests', 'INSERT')
    and not has_table_privilege('authenticated', 'public.access_requests', 'SELECT')
    and not has_table_privilege('authenticated', 'public.access_requests', 'INSERT')
  union all
  select 'access_requests: service_role can read and write',
    has_table_privilege('service_role', 'public.access_requests', 'SELECT')
    and has_table_privilege('service_role', 'public.access_requests', 'INSERT')
    and has_table_privilege('service_role', 'public.access_requests', 'UPDATE')
  union all
  select 'access_requests: one pending application per email index', count(*) = 1
  from pg_indexes where schemaname = 'public' and indexname = 'access_requests_one_pending_per_email'
  union all
  select 'company_members: table exists with RLS on',
    coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.company_members')), false)
  union all
  select 'company_members: exactly one SELECT policy', count(*) = 1
  from pg_policies where schemaname = 'public' and tablename = 'company_members' and cmd = 'SELECT'
  union all
  select 'company_members: no INSERT/UPDATE/DELETE policies', count(*) = 0
  from pg_policies where schemaname = 'public' and tablename = 'company_members' and cmd <> 'SELECT'
  union all
  select 'company_members: authenticated may only SELECT',
    has_table_privilege('authenticated', 'public.company_members', 'SELECT')
    and not has_table_privilege('authenticated', 'public.company_members', 'INSERT')
    and not has_table_privilege('authenticated', 'public.company_members', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.company_members', 'DELETE')
    and not has_table_privilege('anon', 'public.company_members', 'SELECT')
  union all
  select 'creator_directory(): 21 output columns', coalesce(
    (select array_length(p.proargnames, 1) = 21 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'creator_directory'), false)
  union all
  select 'creator_directory(): SECURITY DEFINER with empty search_path', coalesce(
    (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'creator_directory'), false)
  union all
  select 'creator_directory(): no contact/intake columns', coalesce(
    (select not (p.proargnames && array['primary_email', 'inbound_alias', 'previous_inbound_alias', 'whatsapp_number', 'bio'])
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'creator_directory'), false)
  union all
  select 'creator_directory(): authenticated may execute, anon may not',
    has_function_privilege('authenticated', 'public.creator_directory()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.creator_directory()', 'EXECUTE')
  union all
  select 'bucket avatars: public, 2 MB, jpeg/png/webp', coalesce(
    (select public and file_size_limit = 2097152
       and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']
       and cardinality(allowed_mime_types) = 3
     from storage.buckets where id = 'avatars'), false)
  union all
  select 'bucket creator-documents: private, 5 MB, pdf/jpeg/png/webp', coalesce(
    (select not public and file_size_limit = 5242880
       and allowed_mime_types @> array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
       and cardinality(allowed_mime_types) = 4
     from storage.buckets where id = 'creator-documents'), false)
  union all
  select 'storage.objects: no policies mention the new buckets (uploads are server-only)', count(*) = 0
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(avatars|creator-documents)'
)
select check_name, ok from checks;

-- Existing data is untouched: these counts should equal what you saw before.
select (select count(*) from public.profiles) as profiles,
       (select count(*) from public.media_kits) as media_kits,
       (select count(*) from public.deal_chats) as deal_chats,
       (select count(*) from public.access_requests) as access_requests_should_be_0,
       (select count(*) from public.company_members) as company_members_should_be_0;

-- 0024 PREREQUISITE CHECKS — read-only. Run BEFORE pasting the migration.
-- Every row should show ok = true. If any is false, stop: an earlier
-- migration (0001–0023) is missing from this project.

select 'profiles.avatar_url/country/base_rate_usd/shareable_slug (0017)' as check,
       count(*) = 4 as ok
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('avatar_url', 'country', 'base_rate_usd', 'shareable_slug')
union all
select 'profiles.banned_at (0006/0012)', count(*) = 1
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'banned_at'
union all
select 'media_kits.verified_geo_synced_at/youtube_stats_synced_at (0023)', count(*) = 2
from information_schema.columns
where table_schema = 'public' and table_name = 'media_kits'
  and column_name in ('verified_geo_synced_at', 'youtube_stats_synced_at')
union all
select 'private.is_admin() exists (0004)', count(*) = 1
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname = 'is_admin'
union all
select 'public.creator_directory() exists (0010)', count(*) = 1
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'creator_directory'
union all
select 'nothing else depends on creator_directory() (safe to drop/recreate)', count(*) = 0
from pg_depend d join pg_proc p on p.oid = d.refobjid
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'creator_directory' and d.deptype = 'n'
union all
select 'authenticated has no table-level UPDATE on profiles (0003)',
       not has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
union all
select 'storage.buckets table is reachable', count(*) >= 0
from storage.buckets;

-- Informational: buckets that already exist with these ids. If either row
-- appears, 0024 will leave it as it is (on conflict do nothing); compare its
-- settings with the verification output afterwards.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id in ('avatars', 'creator-documents');

-- Read-only checks for 0035. Every ok must be true.
select 'table exists', to_regclass('public.media_kit_videos') is not null;
select 'RLS on', relrowsecurity from pg_class where oid = 'public.media_kit_videos'::regclass;
select 'clients cannot write', not (has_table_privilege('authenticated','public.media_kit_videos','insert') or has_table_privilege('authenticated','public.media_kit_videos','delete'));
select 'nothing older than 30 days', not exists (select 1 from public.media_kit_videos where synced_at < now() - interval '30 days');

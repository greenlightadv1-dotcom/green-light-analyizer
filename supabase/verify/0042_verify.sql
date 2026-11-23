-- Read-only checks for 0042. Every ok must be true.
select 'oauth_connections accepts twitch, kick, tiktok', pg_get_constraintdef(oid) like '%twitch%' and pg_get_constraintdef(oid) like '%kick%' and pg_get_constraintdef(oid) like '%tiktok%' from pg_constraint where conname = 'oauth_connections_platform_check';
select 'media_kits accepts tiktok', pg_get_constraintdef(oid) like '%tiktok%' from pg_constraint where conname = 'media_kits_platform_check';
select 'snapshots accept tiktok', pg_get_constraintdef(oid) like '%tiktok%' from pg_constraint where conname = 'media_kit_snapshots_platform_check';
select 'snapshots accept the new sources', pg_get_constraintdef(oid) like '%twitch_helix_api%' from pg_constraint where conname = 'media_kit_snapshots_source_check';
select 'stats_synced_at exists', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'media_kits' and column_name = 'stats_synced_at');
select 'clients cannot write stats_synced_at', not has_column_privilege('authenticated', 'public.media_kits', 'stats_synced_at', 'update');
select 'oauth_connections stays closed to clients', not has_table_privilege('authenticated', 'public.oauth_connections', 'select') or not exists (select 1 from pg_policies where tablename = 'oauth_connections');

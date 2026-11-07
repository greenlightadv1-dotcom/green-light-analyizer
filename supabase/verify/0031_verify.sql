-- Read-only checks for 0031.
select 'columns exist', (select count(*) from information_schema.columns where table_name='media_kits' and column_name in ('recent_median_views','recent_views_sample')) = 2;
select 'authenticated cannot write them', not has_column_privilege('authenticated','public.media_kits','recent_median_views','update') and not has_column_privilege('authenticated','public.media_kits','recent_median_views','insert');

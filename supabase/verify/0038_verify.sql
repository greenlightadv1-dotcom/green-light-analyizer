-- 0038 verification (read-only). Every row must say ok.
select 'request_key column' as check_name,
  case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'briefs' and column_name = 'request_key' and data_type = 'uuid' and is_nullable = 'YES') then 'ok' else 'MISSING' end as result
union all
select 'partial unique index',
  case when exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'briefs' and indexname = 'briefs_company_request_key_uidx'
      and indexdef ilike '%unique%' and indexdef ilike '%(company_id, request_key)%' and indexdef ilike '%where (request_key is not null)%'
  ) then 'ok' else 'MISSING' end
union all
select 'no duplicate keys',
  case when not exists (select 1 from public.briefs where request_key is not null group by company_id, request_key having count(*) > 1) then 'ok' else 'DUPLICATES' end;

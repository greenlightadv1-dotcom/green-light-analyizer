-- Per-kind summary of catalog-fingerprint.sql (read-only).
with x as (
  select 'col' k, c.table_schema||'.'||c.table_name||'.'||c.column_name n,
         md5(concat_ws('|', c.data_type, c.udt_name, c.is_nullable, c.column_default)) h
    from information_schema.columns c where c.table_schema in ('public','private')
  union all
  select 'rls', n.nspname||'.'||c.relname, md5(c.relrowsecurity::text||c.relforcerowsecurity::text)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r'
  union all
  select 'con', n.nspname||'.'||cl.relname||'.'||co.conname, md5(pg_get_constraintdef(co.oid))
    from pg_constraint co join pg_class cl on cl.oid=co.conrelid join pg_namespace n on n.oid=cl.relnamespace where n.nspname in ('public','private')
  union all
  select 'idx', n.nspname||'.'||ic.relname, md5(regexp_replace(pg_get_indexdef(i.indexrelid), '\s+', ' ', 'g'))
    from pg_index i join pg_class ic on ic.oid=i.indexrelid join pg_namespace n on n.oid=ic.relnamespace where n.nspname in ('public','private')
  union all
  select 'pol', p.schemaname||'.'||p.tablename||'.'||p.policyname, md5(concat_ws('|', p.cmd, p.permissive, p.roles::text, p.qual, p.with_check))
    from pg_policies p where p.schemaname in ('public','private','storage')
  union all
  select 'trg', n.nspname||'.'||cl.relname||'.'||t.tgname, md5(pg_get_triggerdef(t.oid))
    from pg_trigger t join pg_class cl on cl.oid=t.tgrelid join pg_namespace n on n.oid=cl.relnamespace
   where not t.tgisinternal and n.nspname in ('public','private','storage')
  union all
  select 'fn', n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
         md5(regexp_replace(p.prosrc, '\s+', ' ', 'g')||'|'||p.prosecdef::text||'|'||coalesce(array_to_string(p.proconfig, ','), '')||'|'||pg_get_function_result(p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
  union all
  select 'fnacl', n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
         md5(coalesce((select string_agg(a, ',' order by a) from unnest(p.proacl::text[]) a
                        where a ~ '^(anon|authenticated|service_role|)='), ''))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
  union all
  select 'grant', g.table_schema||'.'||g.table_name||':'||g.grantee, md5(string_agg(g.privilege_type, ',' order by g.privilege_type))
    from information_schema.role_table_grants g
   where g.table_schema in ('public','private') and g.grantee in ('anon','authenticated','service_role') group by g.table_schema, g.table_name, g.grantee
  union all
  select 'colgrant', g.table_schema||'.'||g.table_name||':'||g.grantee||':'||g.privilege_type, md5(string_agg(g.column_name, ',' order by g.column_name))
    from information_schema.column_privileges g
   where g.table_schema in ('public','private') and g.grantee in ('anon','authenticated')
   group by g.table_schema, g.table_name, g.grantee, g.privilege_type
  union all
  select 'bucket', b.id, md5(concat_ws('|', b.public, b.file_size_limit, b.allowed_mime_types::text)) from storage.buckets b
  union all
  select 'pub', pt.schemaname||'.'||pt.tablename, 'x' from pg_publication_tables pt where pt.pubname='supabase_realtime'
)
select k, count(*) cnt, md5(string_agg(n||'='||h, ';' order by n)) agg from x group by k order by k;

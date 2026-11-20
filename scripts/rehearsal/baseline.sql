-- Run immediately BEFORE applying migrations: records row counts and a checksum
-- per public table over its current columns, which post-checks.sql compares
-- against afterwards. Creates schema rh (drop it when done).
create schema rh;
create table rh.cols as select table_name, array_agg(column_name::text order by column_name) cols
  from information_schema.columns where table_schema = 'public' group by table_name;
create function rh.checksum(t text) returns text language plpgsql as $$
declare c text[]; r text;
begin
  select cols into c from rh.cols where table_name = t;
  execute format('select md5(coalesce(string_agg(x::text, %L order by x::text), %L)) from (select (select jsonb_object_agg(k, v) from jsonb_each(to_jsonb(s)) e(k, v) where k = any(%L::text[])) x from public.%I s) q', ';', '', c, t) into r;
  return r;
end $$;
create table rh.before as select table_name, rh.checksum(table_name) sum,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I', table_name), false, true, '')))[1]::text::int n
  from rh.cols;

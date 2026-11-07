-- Read-only checks for 0037. Every ok must be true.
select 'table exists', to_regclass('public.news_items') is not null;
select 'anon cannot read', not has_table_privilege('anon','public.news_items','select');
select 'clients cannot write', not (has_table_privilege('authenticated','public.news_items','insert') or has_table_privilege('authenticated','public.news_items','delete'));
select 'only https links', not exists (select 1 from public.news_items where url !~ '^https://');

-- Read-only checks for 0033. Every ok must be true.
select 'table exists', to_regclass('public.taxonomy_terms') is not null;
select 'RLS on', relrowsecurity from pg_class where oid = 'public.taxonomy_terms'::regclass;
select 'every stored category is a term', not exists (select 1 from public.profiles p, unnest(p.creator_categories) v where not exists (select 1 from public.taxonomy_terms t where t.id = v and t.kind = 'category'));
select 'every stored game is a term', not exists (select 1 from public.profiles p, unnest(p.creator_games) v where not exists (select 1 from public.taxonomy_terms t where t.id = v and t.kind = 'game'));
select 'every stored format is a term', not exists (select 1 from public.profiles p, unnest(p.content_formats) v where not exists (select 1 from public.taxonomy_terms t where t.id = v and t.kind = 'format'));
select 'clients cannot write terms', not (has_table_privilege('authenticated','public.taxonomy_terms','insert') or has_table_privilege('authenticated','public.taxonomy_terms','update') or has_table_privilege('anon','public.taxonomy_terms','insert'));
select 'delete not executable by clients', not has_function_privilege('authenticated','public.taxonomy_delete(text)','execute');
select 'creator_tags not client-writable', not has_column_privilege('authenticated','public.profiles','creator_tags','update');
select 'reference triggers present', (select count(*) from pg_trigger where tgname in ('profiles_taxonomy_check','briefs_taxonomy_check')) = 2;

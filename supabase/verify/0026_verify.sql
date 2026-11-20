-- Read-only checks for 0026. Every `ok` must be true.
select 'tables exist' as check,
  to_regclass('public.briefs') is not null and to_regclass('public.invitations') is not null
  and to_regclass('public.collaborations') is not null and to_regclass('public.deliverables') is not null
  and to_regclass('public.collaboration_events') is not null as ok
union all select 'rls on all five', (select bool_and(relrowsecurity) from pg_class where oid in (
  'public.briefs'::regclass, 'public.invitations'::regclass, 'public.collaborations'::regclass,
  'public.deliverables'::regclass, 'public.collaboration_events'::regclass))
union all select 'authenticated is select-only', not exists (
  select 1 from information_schema.role_table_grants where grantee = 'authenticated'
  and table_name in ('briefs','invitations','collaborations','deliverables','collaboration_events')
  and privilege_type <> 'SELECT')
union all select 'anon has nothing', not exists (
  select 1 from information_schema.role_table_grants where grantee = 'anon'
  and table_name in ('briefs','invitations','collaborations','deliverables','collaboration_events'))
union all select 'events append-only for service_role', not exists (
  select 1 from information_schema.role_table_grants where grantee = 'service_role'
  and table_name = 'collaboration_events' and privilege_type in ('UPDATE','DELETE'))
union all select 'transitions not executable by authenticated', not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'collab\_%'
  and has_function_privilege('authenticated', p.oid, 'execute'))
union all select 'transitions executable by service_role', not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'collab\_%'
  and not has_function_privilege('service_role', p.oid, 'execute'))
union all select 'one invitation per creator per brief', exists (
  select 1 from pg_constraint where conname = 'invitations_one_per_creator');

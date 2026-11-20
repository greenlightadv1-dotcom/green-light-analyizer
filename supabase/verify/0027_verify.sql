-- Read-only checks for 0027 (notifications). Every `ok` must be true.
--   psql "$DATABASE_URL" -F'|' -At -f supabase/verify/0027_verify.sql
select 'notifications table exists', to_regclass('public.notifications') is not null;
select 'notification_preferences table exists', to_regclass('public.notification_preferences') is not null;
select 'RLS on notifications', relrowsecurity from pg_class where oid = 'public.notifications'::regclass;
select 'RLS on notification_preferences', relrowsecurity from pg_class where oid = 'public.notification_preferences'::regclass;
select 'trigger installed', exists (select 1 from pg_trigger where tgname = 'collaboration_events_notify' and not tgisinternal);
select 'anon cannot read notifications', not has_table_privilege('anon', 'public.notifications', 'select');
select 'authenticated cannot insert notifications', not has_table_privilege('authenticated', 'public.notifications', 'insert');
select 'authenticated cannot update notifications', not has_table_privilege('authenticated', 'public.notifications', 'update');
select 'authenticated cannot write preferences', not has_table_privilege('authenticated', 'public.notification_preferences', 'insert')
  and not has_table_privilege('authenticated', 'public.notification_preferences', 'update');
select 'service_role cannot insert notifications', not has_table_privilege('service_role', 'public.notifications', 'insert');
select 'service_role may only update read_at', has_column_privilege('service_role', 'public.notifications', 'read_at', 'update')
  and not has_column_privilege('service_role', 'public.notifications', 'kind', 'update');
select 'select policy is recipient-only', exists (
  select 1 from pg_policies where tablename = 'notifications' and policyname = 'notifications_select'
    and qual like '%recipient_id%auth.uid()%');

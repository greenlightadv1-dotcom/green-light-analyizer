-- Read-only checks for 0030. Every ok must be true.
select 'chat_id column', exists (select 1 from information_schema.columns where table_name='notifications' and column_name='chat_id');
select 'messages trigger', exists (select 1 from pg_trigger where tgname='messages_notify' and not tgisinternal);
select 'authenticated still cannot insert notifications', not has_table_privilege('authenticated','public.notifications','insert');

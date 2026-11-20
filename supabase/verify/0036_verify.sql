-- Read-only checks for 0036. Every ok must be true.
select 'relay columns exist', (select count(*) from information_schema.columns where table_schema='public' and table_name='messages' and column_name in ('relay_status','relay_attempts','relay_next_attempt_at','relay_claimed_at','relay_provider_id')) = 5;
select 'functions not executable by clients', not (has_function_privilege('authenticated','public.relay_claim(uuid)','execute') or has_function_privilege('authenticated','public.relay_requeue(uuid)','execute'));
select 'relayed messages marked sent', not exists (select 1 from public.messages where relayed_at is not null and relay_status is distinct from 'sent');
select 'clients cannot write relay state', not has_column_privilege('authenticated','public.messages','relay_status','update');

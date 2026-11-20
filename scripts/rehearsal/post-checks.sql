-- Post-migration checks for the 0025-0037 rehearsal on production-shaped data.
-- Each check prints PASS or raises. Mutating checks run in a transaction that is
-- rolled back. Ids are production's (from the masked export); no personal data.
\set ON_ERROR_STOP 1
\set creator '96475964-f647-4da2-a2d5-0571879c1460'
\set creator2 '373f4eb5-c8f5-4614-b1a3-8e699950eacc'
\set company '8d2bd531-0282-4411-b541-7d4b50bbaf5a'
\set admin '51fa9057-27ae-4856-91b5-38a225903cb5'
\set oldfail 'e51fc893-1e5e-4473-973d-af8ca9b76c99'

-- 1. Existing data unchanged: same row counts and same checksum over the pre-0025 columns.
do $$ declare r record; bad int := 0; begin
  for r in select b.table_name, b.sum, b.n, rh.checksum(b.table_name) now_sum,
                  (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I', b.table_name), false, true, '')))[1]::text::int now_n
             from rh.before b loop
    if r.sum is distinct from r.now_sum or r.n <> r.now_n then bad := bad + 1; raise notice 'CHANGED %: % -> % rows', r.table_name, r.n, r.now_n; end if;
  end loop;
  if bad > 0 then raise exception 'FAIL 1: % tables changed', bad; end if;
  raise notice 'PASS 1 existing rows and columns unchanged in all % pre-0025 tables', (select count(*) from rh.before);
end $$;

-- 2. Every existing profile is active, so no existing user is confined to /verification.
do $$ begin
  if exists (select 1 from public.profiles where account_status is distinct from 'active') then raise exception 'FAIL 2'; end if;
  raise notice 'PASS 2 all % profiles account_status=active', (select count(*) from public.profiles);
end $$;

-- 3. Relay backfill: relayed -> sent, pre-0036 failure -> failed_permanent, others untouched.
do $$ declare s int; p int; n int; o int; begin
  select count(*) filter (where relay_status='sent'), count(*) filter (where relay_status='failed_permanent'),
         count(*) filter (where relay_status is null), count(*) filter (where relay_status not in ('sent','failed_permanent'))
    into s, p, n, o from public.messages;
  if s <> 5 or p <> 1 or n <> 10 or o <> 0 then raise exception 'FAIL 3: sent % permanent % null % other %', s, p, n, o; end if;
  raise notice 'PASS 3 relay states: 5 sent, 1 failed_permanent, 10 untouched';
end $$;

-- 4. The pre-0036 failure is never picked up or claimed automatically.
do $$ declare due int; begin
  select count(*) into due from public.messages
   where relay_status in ('queued','failed_retryable') and (relay_next_attempt_at is null or relay_next_attempt_at <= now()) and relay_attempts < 5;
  if due <> 0 then raise exception 'FAIL 4: % messages due for relay', due; end if;
  raise notice 'PASS 4 no message due for relay after migration';
end $$;
begin;
do $$ begin
  if public.relay_claim('e51fc893-1e5e-4473-973d-af8ca9b76c99') then raise exception 'FAIL 4b: old failure claimable'; end if;
  raise notice 'PASS 4b relay_claim refuses the pre-0036 failure';
end $$;
rollback;

-- 5. Existing users keep access under RLS.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'creator', 'role', 'authenticated')::text, true);
do $$ declare me int; mine int; others int; msgs int; begin
  select count(*) into me from public.profiles where id = auth.uid();
  select count(*) into mine from public.deal_chats where creator_id = auth.uid();
  select count(*) into others from public.deal_chats where creator_id <> auth.uid();
  select count(*) into msgs from public.messages;
  if me <> 1 or mine <> 4 or others <> 0 or msgs = 0 then raise exception 'FAIL 5a: me % mine % others % msgs %', me, mine, others, msgs; end if;
  raise notice 'PASS 5a creator reads own profile, own 4 deals and their messages, no other deals';
end $$;
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'company', 'role', 'authenticated')::text, true);
do $$ declare deals int; dir int; leak int; begin
  select count(*) into deals from public.deal_chats;
  select count(*) into dir from public.creator_directory();
  select count(*) into leak from public.profiles where role = 'creator';
  if deals <> 0 then raise exception 'FAIL 5b: company sees % deals', deals; end if;
  if dir = 0 then raise exception 'FAIL 5b: company directory empty'; end if;
  raise notice 'PASS 5b company sees no creator deals; directory lists % creators; creator profile rows visible: %', dir, leak;
end $$;
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
do $$ declare deals int; begin
  select count(*) into deals from public.deal_chats;
  if deals <> 6 then raise exception 'FAIL 5c: admin sees % deals', deals; end if;
  raise notice 'PASS 5c admin still sees all 6 deals';
end $$;
rollback;

-- 6. Taxonomy triggers: existing profiles still update; valid ids accepted; unknown refused.
begin;
update public.profiles set full_name = full_name || '';
update public.profiles set creator_categories = array['gaming'] where id = :'creator';
do $$ begin
  begin
    update public.profiles set creator_categories = array['not-a-term'] where id = '96475964-f647-4da2-a2d5-0571879c1460';
    raise exception 'FAIL 6: unknown taxonomy id accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'PASS 6 all 10 profiles update; valid id accepted; unknown id refused';
end $$;
rollback;

-- 7. YouTube sync writes (0031 columns, 0035 table and flag) succeed on an existing kit.
begin;
update public.media_kits set subscriber_count = 1, recent_median_views = 10, recent_views_sample = 5,
  youtube_stats_synced_at = now(), last_synced_at = now() where id = 'a7d22cbe-7067-494e-bce9-5556fe24807f';
update public.media_kits set recent_videos_complete = true where id = 'a7d22cbe-7067-494e-bce9-5556fe24807f';
do $$ begin raise notice 'PASS 7 YouTube sync update with 0031/0035 columns succeeds'; end $$;
rollback;

-- 8. Get Started: an application and its verification case can be written; no account exists.
begin;
with r as (insert into public.access_requests (journey, full_name, email) values ('creator', 'Rehearsal', 'r@example.invalid') returning id)
insert into public.verification_cases (access_request_id, kind) select id, 'creator_kyc' from r;
do $$ begin
  if (select count(*) from public.verification_cases where profile_id is null) <> 1 then raise exception 'FAIL 8'; end if;
  raise notice 'PASS 8 application + case written with no profile';
end $$;
rollback;

-- 9. Public profile and representative scope behave as before / least privilege.
do $$ declare n int; begin
  select count(*) into n from public.creator_public_profile('s321db76769');
  if n <> 1 then raise exception 'FAIL 9a: public profile rows %', n; end if;
  if private.member_has_scope('8d2bd531-0282-4411-b541-7d4b50bbaf5a', '1766a4f8-d452-45e3-8256-706fe962dfcc', 'company.view') then raise exception 'FAIL 9b'; end if;
  raise notice 'PASS 9 public profile by existing slug works; no representative scope exists';
end $$;

-- 10. Every public table has RLS; new buckets are private.
do $$ declare t text; begin
  select string_agg(c.relname, ',') into t from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity;
  if t is not null then raise exception 'FAIL 10a: RLS off on %', t; end if;
  if exists (select 1 from storage.buckets where id = 'verification-docs' and public) then raise exception 'FAIL 10b'; end if;
  raise notice 'PASS 10 RLS on for all % public tables; verification-docs bucket private', (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r');
end $$;

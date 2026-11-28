-- 0044 — Unread state for email deal rooms, and closing an account oneself.
--
-- 1. Email rooms notify their creator.
--    0030 notified only in-app rooms (company account on both sides). A room
--    opened from a forwarded email (deal_chats.company_id is null) told its
--    creator nothing in-app: not when it opened, not when the sponsor wrote
--    again. Now every message in an email room that the creator did not write
--    (the platform's opening summary, a sponsor reply relayed back) leaves
--    one unread 'message_received' notification for the creator, the same
--    one-unread-per-room row 0030 keeps. In-app rooms are unchanged.
--
-- 2. public.close_account(profile): the creator or company closes their own
--    account (Settings). One transaction, service_role only. It refuses an
--    admin, an account already closed or banned, and an account with a deal
--    that is agreed or disputed (commission or a dispute is still open).
--    It then:
--      * deletes every platform token and media kit — YouTube API data
--        included (the kit's uploads and snapshots cascade), per Privacy §5
--        and Google's verification review;
--      * deletes the person's own working data: portfolio, content plan,
--        shortlists, profile-visibility settings, notification settings and
--        notifications, team links and scopes;
--      * strips the profile to a placeholder ("Deleted account", an invalid
--        address, no photo, bio, rate, links, WhatsApp number, categories or
--        intake alias) and marks it banned with reason 'account_closed', so
--        every existing exclusion (directory, public page, intake, sign-in
--        guards) applies with no new code path;
--      * renames the company in its in-app rooms.
--    Deal rooms and their messages, violation records, verification cases
--    and the admin audit stay, under the retention periods of Privacy §9;
--    none of them holds YouTube API data. Storage files and the auth user
--    are handled by the server action after this commits.
--
-- Rollback:
--   drop function if exists public.close_account(uuid);
--   and re-run 0030's private.notify_new_message() body.

create or replace function private.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_creator uuid;
  v_recipient uuid;
begin
  select c.company_id, c.creator_id into v_company, v_creator
    from public.deal_chats c where c.id = new.chat_id;

  if v_company is null then
    -- Email room: the creator is the only account in it. Anything they did
    -- not write themselves is news to them.
    v_recipient := case when new.sender_id is distinct from v_creator then v_creator else null end;
  elsif new.sender_id is null then
    -- In-app room: platform messages notify nobody (unchanged from 0030).
    return new;
  else
    v_recipient := case when new.sender_id = v_company then v_creator
                        when new.sender_id = v_creator then v_company
                        else null end;
  end if;

  if v_recipient is null then
    return new;
  end if;
  if exists (
    select 1 from public.notification_preferences p
    where p.profile_id = v_recipient and 'messages' = any (p.muted_categories)
  ) then
    return new;
  end if;
  update public.notifications
     set created_at = new.created_at, actor_id = new.sender_id
   where recipient_id = v_recipient and chat_id = new.chat_id
     and kind = 'message_received' and read_at is null;
  if not found then
    insert into public.notifications (recipient_id, kind, category, chat_id, actor_id, created_at)
    values (v_recipient, 'message_received', 'messages', new.chat_id, new.sender_id, new.created_at);
  end if;
  return new;
end;
$$;
revoke all on function private.notify_new_message() from public, anon, authenticated;

create or replace function public.close_account(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where id = p_profile for update;
  if not found then raise exception 'account:not_found'; end if;
  if v_profile.role = 'admin' then raise exception 'account:admin'; end if;
  if v_profile.banned_at is not null then raise exception 'account:closed'; end if;
  if exists (
    select 1 from public.deal_chats c
     where (c.creator_id = p_profile or c.company_id = p_profile)
       and c.deal_status in ('agreed', 'disputed')
  ) then
    raise exception 'account:open_deals';
  end if;

  delete from public.oauth_connections where creator_id = p_profile;
  delete from public.media_kits where creator_id = p_profile;
  delete from public.media_kit_videos where creator_id = p_profile;
  delete from public.media_kit_snapshots where creator_id = p_profile;
  delete from public.portfolio_items where creator_id = p_profile;
  delete from public.content_items where creator_id = p_profile;
  delete from public.shortlist_entries where creator_id = p_profile;
  delete from public.shortlists where company_id = p_profile;
  delete from public.public_profile_settings where profile_id = p_profile;
  delete from public.notification_preferences where profile_id = p_profile;
  delete from public.notifications where recipient_id = p_profile;
  delete from public.company_member_scopes where company_id = p_profile or member_id = p_profile;
  delete from public.company_members where company_id = p_profile or member_id = p_profile;

  update public.profiles set
    full_name = 'Deleted account',
    primary_email = 'deleted+' || p_profile::text || '@invalid.greenlightadvs.com',
    bio = null,
    avatar_url = null,
    country = null,
    primary_language = null,
    base_rate_usd = null,
    social_links = null,
    shareable_slug = null,
    whatsapp_number = null,
    whatsapp_notifications_enabled = false,
    inbound_alias = null,
    previous_inbound_alias = null,
    creator_categories = '{}',
    creator_games = '{}',
    content_formats = '{}',
    creator_tags = '{}',
    company_website = null,
    company_industry = null,
    banned_at = now(),
    banned_reason = 'account_closed'
  where id = p_profile;

  -- 0043's trigger names an in-app room after its company; refresh it.
  update public.deal_chats set sender_email = 'Deleted account' where company_id = p_profile;
end;
$$;
revoke all on function public.close_account(uuid) from public, anon, authenticated;
grant execute on function public.close_account(uuid) to service_role;
comment on function public.close_account(uuid) is
  'Closes an account at its owner''s request (0044): deletes platform tokens, media kits (YouTube API data included) and the owner''s working data, anonymises the profile and bans it with reason account_closed. Keeps deal records, violations and verification cases (Privacy §9).';

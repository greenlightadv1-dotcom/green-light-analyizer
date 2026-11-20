-- ===========================================================================
-- 0030 — In-app notification for new deal-room messages
-- ===========================================================================
--
-- WHY (docs/EMAIL_FORWARDING_DIAGNOSTIC.md)
--   A creator's reply is emailed to the sponsor only in rooms that came from
--   an external email (deal_chats.company_id is null). In rooms between two
--   Green Light accounts (Discover offers, accepted invitations) a new message
--   reached the other side by no channel at all: no email (by design, §6) and
--   no notification. This adds the missing in-app notification.
--
-- WHAT
--   * notifications gains chat_id; event_id becomes nullable (a message is not
--     a collaboration event); kind/category gain 'message_received'/'messages'.
--   * A trigger on messages insert notifies the other party of an in-app room.
--     One unread notification per room and recipient: a new message refreshes
--     it instead of stacking a row per message.
--   * Still ids only: never the message text.
--
-- WHO
--   Unchanged from 0027: recipients read their own rows; only triggers insert.
--
-- PREREQUISITES 0027.  IDEMPOTENT.
--
-- ROLLBACK (ask first):
--   drop trigger if exists messages_notify on public.messages;
--   drop function if exists private.notify_new_message();
--   delete from public.notifications where kind = 'message_received';
--   then restore 0027's checks and `alter column event_id set not null`.
-- ===========================================================================

alter table public.notifications add column if not exists chat_id uuid references public.deal_chats (id) on delete cascade;
alter table public.notifications alter column event_id drop not null;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'invitation_sent', 'invitation_revised', 'invitation_withdrawn', 'invitation_declined',
  'changes_requested', 'invitation_accepted', 'terms_proposed', 'terms_confirmed', 'terms_agreed',
  'deliverable_added', 'deliverable_removed', 'deliverable_submitted', 'revision_requested',
  'deliverable_approved', 'collaboration_completed', 'collaboration_cancelled',
  'message_received'));
alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications add constraint notifications_category_check
  check (category in ('invitations', 'terms', 'deliverables', 'status', 'messages'));
alter table public.notifications drop constraint if exists notifications_has_subject;
alter table public.notifications add constraint notifications_has_subject
  check (event_id is not null or chat_id is not null);

create unique index if not exists notifications_one_unread_per_chat
  on public.notifications (recipient_id, chat_id) where kind = 'message_received' and read_at is null;

alter table public.notification_preferences drop constraint if exists notification_preferences_muted_categories_check;
alter table public.notification_preferences add constraint notification_preferences_muted_categories_check
  check (muted_categories <@ array['invitations', 'terms', 'deliverables', 'status', 'messages']::text[]);

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
  -- Email rooms (no company account) are relayed by email instead; system
  -- messages (no sender) notify nobody.
  if v_company is null or new.sender_id is null then
    return new;
  end if;
  v_recipient := case when new.sender_id = v_company then v_creator
                      when new.sender_id = v_creator then v_company
                      else null end;
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

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages
  for each row execute function private.notify_new_message();

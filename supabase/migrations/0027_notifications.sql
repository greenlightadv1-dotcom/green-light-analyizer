-- ===========================================================================
-- 0027 — In-app notifications for the collaboration lifecycle
-- ===========================================================================
--
-- WHAT
--   * notifications: one row per (collaboration event, recipient). Created by
--     a trigger on collaboration_events, in the same transaction as the event,
--     so a step can never happen without its notification (or the reverse).
--   * notification_preferences: per-person muted categories. A missing row
--     means nothing is muted.
--
-- WHAT A NOTIFICATION HOLDS
--   Ids, the event kind and a category. Never message, note or terms text:
--   the page renders the wording from the kind, and names/titles through the
--   same narrow projections the collaboration pages use. So a notification
--   can never leak text the recipient could not already read.
--
-- WHO
--   * Recipients are the two parties of the invitation/collaboration, minus
--     whoever acted. Admins are not parties and get none.
--   * anon: nothing. authenticated: SELECT of their own rows only.
--   * service_role: marks rows read (the server scopes every update to the
--     session's own id) and writes preferences. Nobody inserts notifications
--     directly: only the trigger does, as the table owner.
--
-- PREREQUISITES
--   0026 (collaboration tables and collaboration_events).
--
-- IDEMPOTENT: if not exists / create or replace / drop ... if exists.
--
-- ROLLBACK (deletes every notification and preference; ask first):
--   drop trigger if exists collaboration_events_notify on public.collaboration_events;
--   drop function if exists private.notify_collaboration_event();
--   drop function if exists private.notification_category(text);
--   drop table if exists public.notifications, public.notification_preferences;
-- ===========================================================================

create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  muted_categories text[] not null default '{}'::text[]
    check (muted_categories <@ array['invitations', 'terms', 'deliverables', 'status']::text[]),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  event_id bigint not null references public.collaboration_events (id) on delete cascade,
  kind text not null check (kind in (
    'invitation_sent', 'invitation_revised', 'invitation_withdrawn', 'invitation_declined',
    'changes_requested', 'invitation_accepted', 'terms_proposed', 'terms_confirmed', 'terms_agreed',
    'deliverable_added', 'deliverable_removed', 'deliverable_submitted', 'revision_requested',
    'deliverable_approved', 'collaboration_completed', 'collaboration_cancelled')),
  category text not null check (category in ('invitations', 'terms', 'deliverables', 'status')),
  brief_id uuid references public.briefs (id) on delete cascade,
  invitation_id uuid references public.invitations (id) on delete cascade,
  collaboration_id uuid references public.collaborations (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_one_per_recipient unique (event_id, recipient_id)
);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- Event kind → preference category. Immutable and pure.
-- ---------------------------------------------------------------------------
create or replace function private.notification_category(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind in ('invitation_sent', 'invitation_revised', 'invitation_withdrawn', 'invitation_declined',
                    'changes_requested', 'invitation_accepted') then 'invitations'
    when p_kind in ('terms_proposed', 'terms_confirmed', 'terms_agreed') then 'terms'
    when p_kind in ('deliverable_added', 'deliverable_removed', 'deliverable_submitted',
                    'revision_requested', 'deliverable_approved') then 'deliverables'
    when p_kind in ('collaboration_completed', 'collaboration_cancelled') then 'status'
  end
$$;

-- ---------------------------------------------------------------------------
-- Trigger: notify both parties except the actor, unless they muted it.
-- ---------------------------------------------------------------------------
create or replace function private.notify_collaboration_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_creator uuid;
  v_brief uuid;
  v_invitation uuid := new.invitation_id;
  v_category text := private.notification_category(new.event_type);
  v_recipient uuid;
begin
  if new.collaboration_id is not null then
    select c.company_id, c.creator_id, c.brief_id, c.invitation_id
      into v_company, v_creator, v_brief, v_invitation
      from public.collaborations c where c.id = new.collaboration_id;
  else
    select i.company_id, i.creator_id, i.brief_id
      into v_company, v_creator, v_brief
      from public.invitations i where i.id = new.invitation_id;
  end if;

  if v_category is null or (v_company is null and v_creator is null) then
    return new;
  end if;

  foreach v_recipient in array array[v_company, v_creator] loop
    continue when v_recipient is null or v_recipient is not distinct from new.actor_id;
    continue when exists (
      select 1 from public.notification_preferences p
      where p.profile_id = v_recipient and v_category = any (p.muted_categories)
    );
    insert into public.notifications
      (recipient_id, event_id, kind, category, brief_id, invitation_id, collaboration_id, actor_id, created_at)
    values
      (v_recipient, new.id, new.event_type, v_category, v_brief, v_invitation, new.collaboration_id, new.actor_id, new.created_at)
    on conflict (event_id, recipient_id) do nothing;
  end loop;
  return new;
end;
$$;

revoke all on function private.notify_collaboration_event() from public, anon, authenticated;
revoke all on function private.notification_category(text) from public, anon, authenticated;

drop trigger if exists collaboration_events_notify on public.collaboration_events;
create trigger collaboration_events_notify
  after insert on public.collaboration_events
  for each row execute function private.notify_collaboration_event();

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

revoke all on public.notifications, public.notification_preferences from anon, authenticated, service_role;
grant select on public.notifications, public.notification_preferences to authenticated;
-- The server may mark read and clean up, but not create or rewrite a notification.
grant select, delete on public.notifications to service_role;
grant update (read_at) on public.notifications to service_role;
grant select, insert, update on public.notification_preferences to service_role;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

drop policy if exists notification_preferences_select on public.notification_preferences;
create policy notification_preferences_select on public.notification_preferences for select to authenticated
  using (profile_id = (select auth.uid()));

comment on table public.notifications is
  'In-app notifications, one per collaboration event and recipient, written only by the collaboration_events trigger (0027). Holds ids and the event kind, never free text.';
comment on table public.notification_preferences is
  'Per-person muted notification categories (0027). Written by the server only.';

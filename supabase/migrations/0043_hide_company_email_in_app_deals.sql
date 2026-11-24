-- 0043 — in-app deals never carry the company's real email (owner decision,
-- 2026-11-24, CLAUDE.md §16 item 7).
--
-- deal_chats.sender_email held the company's primary_email on every room
-- opened from Discover (discover/actions.ts) or an accepted invitation
-- (collab_respond, 0026). The creator could read it in the room header, the
-- inbox and through PostgREST, since RLS gates rows, not columns: a way for
-- both sides to leave the platform and its commission.
--
-- For a room with a company account behind it, sender_email is now the
-- company's display name: it is only ever shown as the room's title (the
-- email relay, WHOIS check and company brief all run on company_id IS NULL
-- rooms only). Enforced here rather than at each insert, so every path,
-- present and future, gets it. A name that looks like an address falls back
-- to a neutral label. Email and analyzer rooms (company_id NULL) keep the
-- sponsor's address: the creator received that email in their own inbox.

create or replace function public.deal_chats_hide_company_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.company_id is not null then
    select nullif(btrim(full_name), '') into v_name from public.profiles where id = new.company_id;
    if v_name is null or v_name ~ '@' then
      v_name := 'Company on Green Light';
    end if;
    new.sender_email := left(v_name, 200);
  end if;
  return new;
end;
$$;

revoke all on function public.deal_chats_hide_company_email() from public, anon, authenticated;

drop trigger if exists deal_chats_hide_company_email on public.deal_chats;
create trigger deal_chats_hide_company_email
  before insert or update of sender_email, company_id on public.deal_chats
  for each row execute function public.deal_chats_hide_company_email();

-- Scrub rooms opened before this migration (the trigger rewrites the value).
update public.deal_chats set sender_email = sender_email where company_id is not null;

-- A display name is what the other side sees (the directory, a room's title),
-- so it cannot carry contact details either: an email, a phone number (seven
-- or more digits, Arabic-Indic included) or a link / messaging-app name. Same
-- rule as src/lib/name-contact.ts; enforced here because full_name is
-- writable by its owner through PostgREST (0003).
create or replace function public.profiles_name_without_contact()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.full_name ~ '@'
     or new.full_name ~* '(wa\.me|t\.me|discord\.gg|whatsapp|telegram|https?://|www\.)'
     or length(regexp_replace(new.full_name, '[^0-9٠-٩۰-۹]', '', 'g')) >= 7 then
    raise exception 'profile:name_contact' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_name_without_contact on public.profiles;
create trigger profiles_name_without_contact
  before insert or update of full_name on public.profiles
  for each row execute function public.profiles_name_without_contact();

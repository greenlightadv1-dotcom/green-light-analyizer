-- ===========================================================================
-- 0033: Admin-managed taxonomy (categories, genres, games, sports, formats,
-- interests, specializations, campaign categories)
-- ===========================================================================
--
-- Spec: docs/TAXONOMY_AND_GAMING_CATALOG.md
--
-- WHAT
--   * taxonomy_terms: one row per term with a stable id (the value stored
--     on profiles and briefs), a kind, an optional parent, English and
--     Arabic labels and descriptions, active flag and sort order.
--   * Seeded with EXACTLY the ids already in use (src/lib/taxonomy.ts, 0024),
--     so every stored selection stays valid. Genres are added as parents of
--     the existing games; no other new values are invented.
--   * profiles.creator_tags: sports, interests and specializations a
--     creator picks (terms of those kinds), alongside the 0024 columns.
--   * A trigger checks every id written to profiles.creator_categories /
--     creator_games / content_formats / creator_tags and briefs.categories
--     exists with the right kind. A NEWLY added id must be active; an id a
--     row already held stays valid after it is deactivated, so deactivating
--     never breaks or silently edits anyone's data.
--   * taxonomy_delete(): refuses a term that has children or is referenced.
--     Deactivate instead.
--
-- WHO
--   * anon / authenticated: SELECT (labels are public catalogue data).
--   * service_role: writes, from admin-only server actions after validation.
--
-- PREREQUISITES 0024 (profile arrays), 0026 (briefs). IDEMPOTENT.
--
-- ROLLBACK (keeps every stored selection; ask first):
--   drop trigger if exists profiles_taxonomy_check on public.profiles;
--   drop trigger if exists briefs_taxonomy_check on public.briefs;
--   drop function if exists public.taxonomy_delete(text), public.taxonomy_usage(text),
--     private.taxonomy_check_profile(), private.taxonomy_check_brief(),
--     private.taxonomy_valid(text[], text[], text[]), private.taxonomy_parent_check();
--   alter table public.profiles drop column if exists creator_tags;
--   drop table if exists public.taxonomy_terms;
-- ===========================================================================

create table if not exists public.taxonomy_terms (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  kind text not null check (kind in ('category', 'genre', 'game', 'sport', 'format', 'interest', 'specialization', 'campaign_category')),
  parent_id text references public.taxonomy_terms (id) on delete restrict,
  label_en text not null check (char_length(btrim(label_en)) between 1 and 80),
  label_ar text not null check (char_length(btrim(label_ar)) between 1 and 80),
  description_en text check (description_en is null or char_length(description_en) <= 300),
  description_ar text check (description_ar is null or char_length(description_ar) <= 300),
  active boolean not null default true,
  sort_order integer not null default 100 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint taxonomy_not_own_parent check (parent_id is distinct from id)
);
create index if not exists taxonomy_terms_kind_idx on public.taxonomy_terms (kind, sort_order);
create index if not exists taxonomy_terms_parent_idx on public.taxonomy_terms (parent_id);

-- Which kinds may sit under which: a game under a genre or a category, a
-- genre/sport/interest/specialization under a category. No cycles.
create or replace function private.taxonomy_parent_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent_kind text;
  v_cursor text := new.parent_id;
  v_depth int := 0;
begin
  if new.parent_id is null then return new; end if;
  select kind into v_parent_kind from public.taxonomy_terms where id = new.parent_id;
  if v_parent_kind is null then raise exception 'taxonomy:parent_missing'; end if;
  if not (
       (new.kind = 'game' and v_parent_kind in ('genre', 'category'))
    or (new.kind in ('genre', 'sport', 'interest', 'specialization', 'campaign_category') and v_parent_kind = 'category')
  ) then
    raise exception 'taxonomy:parent_kind';
  end if;
  while v_cursor is not null loop
    if v_cursor = new.id then raise exception 'taxonomy:cycle'; end if;
    v_depth := v_depth + 1;
    if v_depth > 4 then raise exception 'taxonomy:too_deep'; end if;
    select parent_id into v_cursor from public.taxonomy_terms where id = v_cursor;
  end loop;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists taxonomy_parent_check on public.taxonomy_terms;
create trigger taxonomy_parent_check before insert or update on public.taxonomy_terms
  for each row execute function private.taxonomy_parent_check();

-- Kind is part of a term's identity: changing it would re-type stored values.
create or replace function private.taxonomy_kind_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind <> old.kind then raise exception 'taxonomy:kind_frozen'; end if;
  return new;
end;
$$;
drop trigger if exists taxonomy_kind_frozen on public.taxonomy_terms;
create trigger taxonomy_kind_frozen before update of kind on public.taxonomy_terms
  for each row execute function private.taxonomy_kind_frozen();

-- ---------------------------------------------------------------------------
-- Seed: the ids already stored by 0024 (same ids, so nothing is migrated).
-- ---------------------------------------------------------------------------
insert into public.taxonomy_terms (id, kind, label_en, label_ar, sort_order) values
  ('gaming', 'category', 'Gaming', 'ألعاب', 10),
  ('esports', 'category', 'Esports', 'رياضات إلكترونية', 20),
  ('tech', 'category', 'Tech', 'تقنية', 30),
  ('entertainment', 'category', 'Entertainment', 'ترفيه', 40),
  ('education', 'category', 'Education', 'تعليم', 50),
  ('lifestyle', 'category', 'Lifestyle', 'أسلوب حياة', 60),
  ('beauty', 'category', 'Beauty', 'جمال', 70),
  ('fitness', 'category', 'Fitness', 'لياقة', 80),
  ('finance', 'category', 'Finance', 'مال', 90),
  ('food', 'category', 'Food', 'طعام', 100),
  ('travel', 'category', 'Travel', 'سفر', 110),
  ('music', 'category', 'Music', 'موسيقى', 120),
  ('other', 'category', 'Other', 'أخرى', 1000),
  ('live_stream', 'format', 'Live streams', 'بث مباشر', 10),
  ('long_video', 'format', 'Long videos', 'فيديوهات طويلة', 20),
  ('short_video', 'format', 'Short videos', 'فيديوهات قصيرة', 30),
  ('esports_casting', 'format', 'Esports casting', 'تعليق رياضات إلكترونية', 40),
  ('tutorials', 'format', 'Tutorials', 'شروحات', 50),
  ('reviews', 'format', 'Reviews', 'مراجعات', 60),
  ('podcast', 'format', 'Podcast', 'بودكاست', 70),
  ('social_posts', 'format', 'Social posts', 'منشورات اجتماعية', 80)
on conflict (id) do nothing;

-- Genres organise the existing games (new parents only; the game ids are unchanged).
insert into public.taxonomy_terms (id, kind, parent_id, label_en, label_ar, sort_order) values
  ('genre_tactical_shooter', 'genre', 'gaming', 'Tactical shooter', 'تصويب تكتيكي', 10),
  ('genre_shooter', 'genre', 'gaming', 'Shooter', 'تصويب', 20),
  ('genre_battle_royale', 'genre', 'gaming', 'Battle royale', 'باتل رويال', 30),
  ('genre_moba', 'genre', 'gaming', 'MOBA', 'موبا', 40),
  ('genre_sandbox', 'genre', 'gaming', 'Sandbox', 'عالم مفتوح للبناء', 50),
  ('genre_open_world', 'genre', 'gaming', 'Open world / action', 'عالم مفتوح / أكشن', 60),
  ('genre_sports_racing', 'genre', 'gaming', 'Sports and racing', 'رياضة وسباقات', 70)
on conflict (id) do nothing;

insert into public.taxonomy_terms (id, kind, parent_id, label_en, label_ar, sort_order) values
  ('valorant', 'game', 'genre_tactical_shooter', 'Valorant', 'Valorant', 10),
  ('counter_strike', 'game', 'genre_tactical_shooter', 'Counter-Strike 2', 'Counter-Strike 2', 20),
  ('league_of_legends', 'game', 'genre_moba', 'League of Legends', 'League of Legends', 30),
  ('dota2', 'game', 'genre_moba', 'Dota 2', 'Dota 2', 40),
  ('fortnite', 'game', 'genre_battle_royale', 'Fortnite', 'Fortnite', 50),
  ('minecraft', 'game', 'genre_sandbox', 'Minecraft', 'Minecraft', 60),
  ('gta', 'game', 'genre_open_world', 'Grand Theft Auto V / Online', 'Grand Theft Auto V / Online', 70),
  ('call_of_duty', 'game', 'genre_shooter', 'Call of Duty', 'Call of Duty', 80),
  ('pubg', 'game', 'genre_battle_royale', 'PUBG / PUBG Mobile', 'PUBG / PUBG Mobile', 90),
  ('free_fire', 'game', 'genre_battle_royale', 'Free Fire', 'Free Fire', 100),
  ('roblox', 'game', 'genre_sandbox', 'Roblox', 'Roblox', 110),
  ('ea_fc', 'game', 'genre_sports_racing', 'EA SPORTS FC', 'EA SPORTS FC', 120),
  ('apex_legends', 'game', 'genre_battle_royale', 'Apex Legends', 'Apex Legends', 130),
  ('rocket_league', 'game', 'genre_sports_racing', 'Rocket League', 'Rocket League', 140),
  ('mobile_legends', 'game', 'genre_moba', 'Mobile Legends', 'Mobile Legends', 150),
  ('genshin_impact', 'game', 'genre_open_world', 'Genshin Impact', 'Genshin Impact', 160),
  ('just_chatting', 'game', 'gaming', 'Just Chatting', 'دردشة', 900),
  ('variety', 'game', 'gaming', 'Variety / multiple games', 'منوّع / عدة ألعاب', 910),
  ('other_game', 'game', 'gaming', 'Other game', 'لعبة أخرى', 1000)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Creator tags (sports, interests, specializations)
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists creator_tags text[] not null default '{}';
alter table public.profiles drop constraint if exists profiles_creator_tags_len;
alter table public.profiles add constraint profiles_creator_tags_len check (cardinality(creator_tags) <= 20);

-- ---------------------------------------------------------------------------
-- Reference checks
-- ---------------------------------------------------------------------------
-- True when every id in p_new is a term of one of p_kinds, and every id not
-- already in p_old is active.
create or replace function private.taxonomy_valid(p_new text[], p_old text[], p_kinds text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from unnest(coalesce(p_new, '{}')) v
     where not exists (
       select 1 from public.taxonomy_terms t
        where t.id = v and t.kind = any (p_kinds)
          and (t.active or v = any (coalesce(p_old, '{}'))))
  )
$$;
revoke all on function private.taxonomy_valid(text[], text[], text[]) from public, anon, authenticated;

create or replace function private.taxonomy_check_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare o public.profiles%rowtype;
begin
  if tg_op = 'UPDATE' then o := old; end if;
  if not private.taxonomy_valid(new.creator_categories, o.creator_categories, array['category'])
     or not private.taxonomy_valid(new.creator_games, o.creator_games, array['game'])
     or not private.taxonomy_valid(new.content_formats, o.content_formats, array['format'])
     or not private.taxonomy_valid(new.creator_tags, o.creator_tags, array['sport', 'interest', 'specialization']) then
    raise exception 'taxonomy:unknown_term';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_taxonomy_check on public.profiles;
create trigger profiles_taxonomy_check
  before insert or update of creator_categories, creator_games, content_formats, creator_tags on public.profiles
  for each row execute function private.taxonomy_check_profile();

create or replace function private.taxonomy_check_brief()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare o_cats text[];
begin
  if tg_op = 'UPDATE' then o_cats := old.categories; end if;
  if not private.taxonomy_valid(new.categories, o_cats, array['category', 'campaign_category']) then
    raise exception 'taxonomy:unknown_term';
  end if;
  return new;
end;
$$;
drop trigger if exists briefs_taxonomy_check on public.briefs;
create trigger briefs_taxonomy_check before insert or update of categories on public.briefs
  for each row execute function private.taxonomy_check_brief();

-- How many rows reference a term (profiles, briefs) or sit under it.
create or replace function public.taxonomy_usage(p_id text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.profiles
           where p_id = any (creator_categories) or p_id = any (creator_games)
              or p_id = any (content_formats) or p_id = any (creator_tags))::int
       + (select count(*) from public.briefs where p_id = any (categories))::int
       + (select count(*) from public.taxonomy_terms where parent_id = p_id)::int
$$;

create or replace function public.taxonomy_delete(p_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.taxonomy_terms where id = p_id for update;
  if not found then raise exception 'taxonomy:not_found'; end if;
  if public.taxonomy_usage(p_id) > 0 then raise exception 'taxonomy:in_use'; end if;
  delete from public.taxonomy_terms where id = p_id;
end;
$$;
revoke all on function public.taxonomy_usage(text) from public, anon, authenticated;
revoke all on function public.taxonomy_delete(text) from public, anon, authenticated;
grant execute on function public.taxonomy_usage(text) to service_role;
grant execute on function public.taxonomy_delete(text) to service_role;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.taxonomy_terms enable row level security;
revoke all on public.taxonomy_terms from anon, authenticated;
grant select on public.taxonomy_terms to anon, authenticated;
grant select, insert, update on public.taxonomy_terms to service_role;
drop policy if exists taxonomy_terms_read on public.taxonomy_terms;
create policy taxonomy_terms_read on public.taxonomy_terms for select to anon, authenticated using (true);

-- creator_tags is server-written like the 0024 arrays.
revoke update (creator_tags) on public.profiles from authenticated;

comment on table public.taxonomy_terms is
  'Admin-managed taxonomy (0033). ids are the values stored on profiles and briefs; deactivate rather than delete a referenced term.';

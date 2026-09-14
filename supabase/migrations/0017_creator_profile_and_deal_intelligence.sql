-- ---------------------------------------------------------------------------
-- Green Light — creator profile expansion, WhatsApp notification prefs, and
-- deal intelligence caching.
--
-- Three unrelated additions bundled into one migration because they ship
-- together as one product round:
--
--   1. Creator profile fields (bio/avatar/country/language/base rate/social
--      links/shareable slug) — additive to the existing §7 verified-audience
--      model, not a replacement for it. avg_views, engagement_rate,
--      declared_top_countries, verified_top_countries and
--      analytics_oauth_connected on media_kits are untouched: this is a
--      friendlier "who is this creator" layer that sits above that data, not
--      instead of it.
--   2. whatsapp_number / whatsapp_notifications_enabled — opt-in delivery
--      preference. The actual send path (src/lib/whatsapp.ts) degrades
--      quietly when no WhatsApp Business API credentials are configured,
--      the same convention as every other optional integration in §9.
--   3. deal_chats.security_check / is_likely_sponsorship — server-authoritative
--      caches. security_check stores the existing WHOIS + Safe Browsing +
--      trust-score result (src/lib/security/check.ts) computed once at
--      deal-creation time instead of re-fetched on every deal-room view.
--      is_likely_sponsorship is the inbound-email spam/notification filter's
--      verdict (src/lib/ai/spam-filter.ts). Both follow the same rule as
--      ai_evaluation/offered_amount (0003_rls_policies.sql): the party being
--      rated must not be able to write their own rating, so neither is
--      granted to `authenticated` at all — only service_role, which is what
--      every deal-creation path (email intake, Manual Analyzer, Discover
--      offers) already writes through.
-- ---------------------------------------------------------------------------

-- 1. Creator profile fields ---------------------------------------------------

alter table public.profiles
  add column if not exists bio text,
  add column if not exists avatar_url text,
  add column if not exists country text,
  add column if not exists primary_language text,
  add column if not exists base_rate_usd numeric(10, 2),
  add column if not exists social_links jsonb,
  add column if not exists shareable_slug text unique,
  add column if not exists whatsapp_number text,
  add column if not exists whatsapp_notifications_enabled boolean not null default false;

comment on column public.profiles.social_links is
  'e.g. {"youtube":"@handle","instagram":"@handle","tiktok":"@handle","x":"@handle","twitch":"handle"} — handles or full URLs, creator-entered, not verified.';
comment on column public.profiles.shareable_slug is
  'Public profile path: greenlight.com/p/<slug>. Unique; NULLs (not yet generated) are unrestricted under a standard UNIQUE constraint.';
comment on column public.profiles.base_rate_usd is
  'Creator-entered starting rate shown on their public profile and Media Kit — self-reported, not part of the §7.4 pricing evaluation.';

-- Extends the existing `GRANT UPDATE (full_name)` from 0003_rls_policies.sql —
-- Postgres column privileges are additive, so this does not need to repeat it.
-- Every column below is the creator's own preference/profile data, none of it
-- security-sensitive the way role/subscription_plan/verified flags are.
grant update (
  bio, avatar_url, country, primary_language, base_rate_usd, social_links,
  shareable_slug, whatsapp_number, whatsapp_notifications_enabled
) on public.profiles to authenticated;

-- 2. deal_chats: server-authoritative intelligence caches --------------------

alter table public.deal_chats
  add column if not exists security_check jsonb,
  add column if not exists is_likely_sponsorship boolean not null default true;

comment on column public.deal_chats.security_check is
  'Cached src/lib/security/check.ts result (domain, whois, safeBrowsing, trustScore, reasons) computed once at deal-creation time. service_role-written only — see 0003_rls_policies.sql''s reasoning for ai_evaluation/offered_amount, which applies identically here.';
comment on column public.deal_chats.is_likely_sponsorship is
  'Inbound-email spam/notification heuristic (src/lib/ai/spam-filter.ts). Always true for Manual Analyzer and Discover-originated deals — a human deliberately created those. service_role-written only.';

-- Deliberately no new GRANT for `authenticated` on either column: table-level
-- UPDATE was already revoked from authenticated in 0003_rls_policies.sql, and
-- both stay outside every column-level GRANT since then, so they default to
-- service_role-only, same as ai_evaluation/offered_amount.

create index if not exists deal_chats_is_likely_sponsorship_idx
  on public.deal_chats (is_likely_sponsorship);

-- 3. Public shareable profile — a SECURITY DEFINER RPC, not a profiles policy
--
-- Same reasoning as public.creator_directory() in 0010_company_access.sql:
-- opening a row-level policy on profiles for anon would hand out the whole
-- row over PostgREST, primary_email and inbound_alias included, because RLS
-- gates rows, not columns. This function's column list is fixed in its SQL
-- body instead, so there is no query shape that gets more out of it than the
-- columns it names — and unlike creator_directory(), it must work for a
-- signed-out visitor who just clicked a shared link, so EXECUTE is granted to
-- anon as well as authenticated.
create or replace function public.creator_public_profile(p_slug text)
returns table (
  full_name text,
  avatar_url text,
  bio text,
  country text,
  primary_language text,
  social_links jsonb,
  base_rate_usd numeric,
  platforms text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.full_name,
    p.avatar_url,
    p.bio,
    p.country,
    p.primary_language,
    p.social_links,
    p.base_rate_usd,
    all_platforms.platforms
  from public.profiles p
  left join lateral (
    select array_agg(m.platform order by m.platform) as platforms
    from public.media_kits m
    where m.creator_id = p.id
  ) all_platforms on true
  where p.shareable_slug = p_slug
    and p.role = 'creator'
    and p.banned_at is null;
$$;

revoke all on function public.creator_public_profile(text) from public;
grant execute on function public.creator_public_profile(text) to anon, authenticated;

comment on function public.creator_public_profile(text) is
  'Public shareable-profile lookup by slug (greenlight.com/p/<slug>). Returns only public.profiles.full_name/avatar_url/bio/country/primary_language/social_links/base_rate_usd plus connected platforms — hardcoded in this function''s own SQL, never primary_email or inbound_alias. Returns zero rows for a banned account, a non-creator, or an unknown slug.';

create index if not exists profiles_shareable_slug_idx
  on public.profiles (shareable_slug)
  where shareable_slug is not null;

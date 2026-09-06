-- ---------------------------------------------------------------------------
-- Green Light — initial schema
-- Applied verbatim from CLAUDE.md §10. Extend with new migrations rather than
-- editing this file in place once it has been deployed.
--
-- STATUS: APPLIED to Supabase project `green-light` (ref kpuecrvdrkhemyvibyfa,
-- eu-central-1). Do not edit — write a new migration.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT CHECK (role IN ('creator', 'company', 'admin')) NOT NULL,
  region TEXT CHECK (region IN ('MENA', 'International')) DEFAULT 'MENA',
  subscription_plan TEXT CHECK (subscription_plan IN ('Starter', 'Pro', 'Elite')) DEFAULT 'Starter',
  inbound_alias TEXT UNIQUE,
  primary_email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.media_kits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT CHECK (platform IN ('youtube', 'twitch', 'kick', 'instagram')) NOT NULL,
  avg_views INT DEFAULT 0,
  avg_ccv INT DEFAULT 0,
  engagement_rate NUMERIC(5,2),
  content_category TEXT,
  content_language TEXT,
  declared_top_countries JSONB,   -- e.g. [{"country":"EG","pct":40}, {"country":"SA","pct":25}]
  verified_top_countries JSONB,   -- same shape, only populated via OAuth sync
  audience_verified BOOLEAN DEFAULT FALSE,
  analytics_oauth_connected BOOLEAN DEFAULT FALSE,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.deal_chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_email TEXT NOT NULL,
  deal_status TEXT CHECK (deal_status IN ('new', 'negotiating', 'agreed', 'paid', 'disputed')) DEFAULT 'new',
  offered_amount NUMERIC(10, 2),
  ai_evaluation TEXT CHECK (ai_evaluation IN ('green', 'yellow', 'red')),
  sponsorship_type TEXT CHECK (sponsorship_type IN
    ('video_dedicated', 'integration', 'story_share', 'live_mention', 'post', 'other')),
  target_countries TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID REFERENCES public.deal_chats(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  is_masked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_chats ENABLE ROW LEVEL SECURITY;

-- ###########################################################################
-- TODO BEFORE LAUNCH — carried over from the spec's own SQL comment (§10),
-- and NOT yet done. Right now `profiles` and `deal_chats` have RLS enabled
-- with ZERO policies, which denies all access to the anon/authenticated
-- roles; and `media_kits` / `messages` have RLS switched OFF entirely, which
-- means any authenticated user could read every creator's audience data and
-- every message in the product. Neither state is shippable.
--
-- Still to write (tracked in 0003_rls_policies.sql, currently a stub):
--   1. ALTER TABLE public.media_kits ENABLE ROW LEVEL SECURITY;
--      ALTER TABLE public.messages   ENABLE ROW LEVEL SECURITY;
--   2. profiles     — a user may read/update their own row; a company must
--                     NEVER be able to select a creator's `primary_email` or
--                     `inbound_alias` (§6, §12: contact info is a security
--                     boundary, not a UI convention). Enforce with a
--                     column-limited view or column-level grants, not just by
--                     omitting the column in the client query.
--   3. media_kits   — creator reads/writes own; companies read only the
--                     non-identifying stats of creators they have an open
--                     deal_chat with.
--   4. deal_chats   — readable/updatable only by its creator_id or company_id.
--   5. messages     — readable only by a party to the parent deal_chat;
--                     insertable only as yourself, and only after the
--                     server-side mask (§6.1) has run.
--   6. admin        — bypasses via the service role, NOT via a policy that
--                     trusts a client-supplied role claim.
-- ###########################################################################

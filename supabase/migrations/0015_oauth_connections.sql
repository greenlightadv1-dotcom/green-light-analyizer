-- ---------------------------------------------------------------------------
-- Green Light — OAuth token storage for YouTube Analytics / Instagram Graph
--
-- Own table rather than columns on media_kits, deliberately: an access/
-- refresh token is a bearer credential, more sensitive than anything already
-- living in a table that is partially readable by `authenticated`. Same
-- isolation as promo_codes (0013) -- no RLS policy for `authenticated` at
-- all, so every read and write, with no exception, goes through
-- createAdminClient().
-- ---------------------------------------------------------------------------

CREATE TABLE public.oauth_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'instagram')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  -- Resolved YouTube channel ID / Instagram Business Account ID, so a later
  -- Analytics/Insights call never has to re-derive it from the token.
  external_account_id TEXT,
  scope TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (creator_id, platform)
);

COMMENT ON TABLE public.oauth_connections IS
  'YouTube Analytics / Instagram Graph API OAuth tokens (§7.3). No RLS policy for authenticated -- every access goes through createAdminClient(). No app-layer encryption on top of Postgres''s own at-rest encryption, matching how every other secret in this schema is protected (RLS + column grants, not a second key-management story); a compromised SUPABASE_SERVICE_ROLE_KEY already exposes everything else in this database the same way.';

ALTER TABLE public.oauth_connections ENABLE ROW LEVEL SECURITY;

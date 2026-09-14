-- ---------------------------------------------------------------------------
-- Green Light — inbound email intake (§5)
--
-- Adds the one thing a webhook endpoint cannot work without: a record of what
-- has already been processed.
--
-- Resend retries a delivery that does not return 2xx, and will happily retry
-- one that timed out after our side already committed. Without a uniqueness
-- key on the provider's message id, every retry mints a second deal room and a
-- second Gemini call for the same offer — duplicated rooms in the creator's
-- inbox and duplicated spend on the paid path.
--
-- The table doubles as the operations trail for "my offer never showed up",
-- which is otherwise unanswerable: an email that arrives for an unknown alias
-- currently leaves no trace anywhere.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inbound_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Provider's id for this delivery. The idempotency key.
  provider_message_id TEXT NOT NULL UNIQUE,
  -- The alias the mail was addressed to, lowercased. Kept even when it does
  -- not resolve, so a misconfigured forwarding rule is diagnosable.
  to_alias TEXT,
  -- Resolved creator, or NULL when the alias matched nobody.
  creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  chat_id UUID REFERENCES public.deal_chats(id) ON DELETE SET NULL,
  sender_email TEXT,
  status TEXT NOT NULL CHECK (status IN ('processed', 'unknown_alias', 'rejected', 'failed')),
  -- Short operator-facing note. Never the message body.
  detail TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.inbound_emails IS
  'One row per inbound delivery from Resend (§5.3). provider_message_id is the idempotency key that stops a retry creating a second deal room. Written by the webhook as service_role; readable by admins only.';

COMMENT ON COLUMN public.inbound_emails.detail IS
  'Operator-facing note only. The offer body is never stored here — it lives, masked, in public.messages.';

CREATE INDEX IF NOT EXISTS inbound_emails_creator_idx ON public.inbound_emails (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inbound_emails_status_idx ON public.inbound_emails (status, created_at DESC);

ALTER TABLE public.inbound_emails ENABLE ROW LEVEL SECURITY;

-- Admins read; nothing is client-writable. The webhook runs as service_role.
DROP POLICY IF EXISTS inbound_emails_select ON public.inbound_emails;
CREATE POLICY inbound_emails_select ON public.inbound_emails
  FOR SELECT TO authenticated
  USING (private.is_admin());

REVOKE ALL ON public.inbound_emails FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.inbound_emails FROM authenticated;

-- Alias lookup is the hot path of every delivery, and it is matched
-- case-insensitively because email local-parts arrive in whatever case the
-- forwarding rule produced.
CREATE INDEX IF NOT EXISTS profiles_inbound_alias_lower_idx
  ON public.profiles (lower(inbound_alias));

-- Finding an open thread for (creator, sender) so a reply appends to the
-- existing room instead of opening a duplicate one.
CREATE INDEX IF NOT EXISTS deal_chats_creator_sender_idx
  ON public.deal_chats (creator_id, lower(sender_email), created_at DESC);

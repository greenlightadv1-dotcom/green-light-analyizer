-- ---------------------------------------------------------------------------
-- Green Light — Deal Chat Room support
--
-- Three things the §10 schema does not cover but §6 requires:
--
--   1. violation_logs — §6 says a detected attempt to exchange contact details
--      must be "logged (which regex matched, redacted) for admin review, in
--      addition to being blocked in real time". There is nowhere to log it.
--
--   2. profiles.banned_at — §6 and §12 make off-platform contact exchange a
--      permanent ban. There is no column to record one.
--
--   3. Realtime — §9 lists Supabase Realtime websockets as the chat transport,
--      but a table only emits changes once it is in the supabase_realtime
--      publication.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. Violation audit log
--
-- Stores WHICH rules fired and the ALREADY-MASKED excerpt — never the raw
-- text. Logging a violation by keeping a verbatim copy of the phone number
-- would defeat the point of stripping it, and would put the very PII §6
-- protects into a second table.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.violation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  chat_id    UUID REFERENCES public.deal_chats(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  -- Subset of 'email' | 'phone' | 'social' — the rules that matched.
  matched_rules TEXT[] NOT NULL,
  -- The masked rendering of the offending message. Safe to show an admin.
  redacted_excerpt TEXT NOT NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.violation_logs IS
  'Audit trail for §6 masking violations. Written by the server only; readable by admins only. redacted_excerpt is post-mask text — raw contact details must never be stored here.';

CREATE INDEX IF NOT EXISTS violation_logs_profile_id_idx ON public.violation_logs (profile_id);
CREATE INDEX IF NOT EXISTS violation_logs_unreviewed_idx ON public.violation_logs (created_at DESC) WHERE reviewed_at IS NULL;

ALTER TABLE public.violation_logs ENABLE ROW LEVEL SECURITY;

-- Admins read. Nobody writes from a client: entries are created by the server
-- as service_role, so a user cannot suppress the record of their own attempt.
DROP POLICY IF EXISTS violation_logs_select ON public.violation_logs;
CREATE POLICY violation_logs_select ON public.violation_logs
  FOR SELECT TO authenticated
  USING (private.is_admin());

REVOKE ALL ON public.violation_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.violation_logs FROM authenticated;
-- Admins may mark an entry reviewed; nothing else is client-writable.
GRANT UPDATE (reviewed_at, reviewed_by) ON public.violation_logs TO authenticated;

DROP POLICY IF EXISTS violation_logs_update ON public.violation_logs;
CREATE POLICY violation_logs_update ON public.violation_logs
  FOR UPDATE TO authenticated
  USING (private.is_admin())
  WITH CHECK (private.is_admin());


-- ===========================================================================
-- 2. Ban state
--
-- Set by an admin from the violation queue, not by the message handler.
--
-- §6 and §12 make the ban itself non-negotiable and not a warning-first
-- policy, and this column is how it is recorded. What is deliberately NOT
-- automatic is the *trigger*: the §6.1 phone pattern matches any 10-digit-ish
-- run, so "my last 3 videos did 250 000 3000 views" trips it. Permanently
-- banning a paying creator on a regex false positive is not a risk worth
-- taking when the message is already blocked either way. The server blocks and
-- logs in real time; an admin converts the log entry into the ban.
-- ===========================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS banned_reason TEXT;

COMMENT ON COLUMN public.profiles.banned_at IS
  'Set by an admin acting on a violation_logs entry (§6, §12). Non-null means the account is permanently banned; requireProfile() refuses the session.';

-- Deliberately NOT added to the authenticated UPDATE column grant on profiles,
-- so a banned user cannot clear their own ban. Only service_role writes it.


-- ===========================================================================
-- 3. Realtime
--
-- deal_chats is published too, so a room created by the inbound-email webhook
-- (§5.5) appears in an open inbox without a refresh. Realtime respects RLS, so
-- a subscriber still only receives rows their policies already admit.
-- ===========================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'deal_chats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_chats;
  END IF;
END
$$;

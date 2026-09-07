-- ---------------------------------------------------------------------------
-- Green Light — outbound relay tracking (§6)
--
-- §6: "When a creator replies in-app, the reply is relayed to the company as
-- an official email sent from the platform's own server."
--
-- That makes the relay the actual delivery mechanism of the product, not a
-- notification on the side. A relay that fails silently means the company
-- never hears back, the creator believes they replied, and the deal dies with
-- nobody able to say why. So the outcome is recorded per message.
-- ---------------------------------------------------------------------------

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS relayed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS relay_error TEXT;

COMMENT ON COLUMN public.messages.relayed_at IS
  'When this message was successfully relayed to the company as platform email (§6). NULL on inbound and platform-authored messages, which are never relayed outward.';

COMMENT ON COLUMN public.messages.relay_error IS
  'Why the last relay attempt failed. Operator-facing; never shown to the company.';

-- Deliberately NOT added to the authenticated column grant: whether a message
-- reached the company is the server's finding, and a sender who could set
-- relayed_at themselves could fake a delivery that never happened.

-- Finding messages that still need relaying, e.g. for a retry sweep.
CREATE INDEX IF NOT EXISTS messages_pending_relay_idx
  ON public.messages (created_at)
  WHERE relayed_at IS NULL AND sender_id IS NOT NULL;

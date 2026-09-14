-- ---------------------------------------------------------------------------
-- Green Light — store the Deal Co-Pilot's recommended price on the deal.
--
-- Until now the §1 price recommendation existed only as prose inside the
-- opening system message of a deal room ("Recommended: $2,100 (fair range
-- …)"). Nothing could read it back, which produced two real defects:
--
--   1. The Manual Analyzer (§5.1) had nowhere to put the recommendation, so
--      it wrote it into `offered_amount` — the column that means "what the
--      sponsor offered". Every analyzer-created deal therefore displayed the
--      platform's own suggestion as if the sponsor had proposed it.
--   2. The negotiation workspace's reply generator (§6) could not tell the
--      model what the recommended price was, so its central instruction
--      ("if the offer is below the recommended price, propose the recommended
--      price") could never fire.
--
-- Same trust rule as `ai_evaluation` and `offered_amount`
-- (0003_rls_policies.sql): this is the platform's finding about a deal, not a
-- claim either party may assert, so it is never granted to `authenticated` —
-- only service_role, which is what all three deal-creation paths (email
-- intake, Manual Analyzer, Discover offers) already write through.
--
-- Nullable with no backfill on purpose: rows created before this migration
-- have no recoverable recommendation (parsing it back out of a localized
-- message body would be a guess), and the UI treats null as "not recorded"
-- rather than showing a fabricated number.
-- ---------------------------------------------------------------------------

alter table public.deal_chats
  add column if not exists recommended_price_usd numeric(10, 2);

comment on column public.deal_chats.recommended_price_usd is
  'Deal Co-Pilot recommended price at deal-creation time (USD). Server-authoritative: written only by service_role, never granted to authenticated. Null for deals created before migration 0018.';

/**
 * The AI half of "Company & Domain Intelligence" (§6's negotiation
 * workspace) — a written account of who is behind a sponsorship offer.
 *
 * Kept in its own module, free of `server-only` and of any import from
 * database.ts, so the deal-room components can type the cached JSONB column
 * without pulling a server module into the client bundle. Same arrangement as
 * lib/security/types.ts.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * This is GENERATED, not MEASURED. Read that as a product rule, not a caveat.
 * ───────────────────────────────────────────────────────────────────────────
 * `SecurityCheckResult` holds facts with a source: a WHOIS record, a Safe
 * Browsing verdict. This holds a language model's recollection of a company,
 * which can be fluent and wrong, and which no API confirmed. The two are
 * cached in separate columns and must stay visually distinct in the UI, for
 * the same reason §7.2 splits declared_top_countries from
 * verified_top_countries: this product's entire promise is that it never
 * presents something as verified when it is not.
 *
 * That is also why `confidence` and `isKnownToModel` exist and are not
 * decorative. A model asked about an unknown domain will invent a plausible
 * company rather than say it has never heard of one, so the prompt requires
 * it to declare that explicitly, and the UI renders a not-known result as
 * "no public information" instead of printing the prose.
 */

export type CompanyTrustBand = "low" | "medium" | "high";

export type CompanyProfile = {
  /** The domain this profile describes — the sender's email domain. */
  domain: string;
  /**
   * False when the model has no real knowledge of this domain. Everything
   * below is then either empty or speculative and must not be shown as fact.
   */
  isKnownToModel: boolean;
  /** What the company appears to be: sector, size, what it sells. */
  background: string;
  /** Trading history and reputation, as far as the model can account for it. */
  history: string;
  /**
   * 0-100, the model's own read of how safe this counterparty looks.
   * Deliberately separate from SecurityCheckResult.trustScore, which is
   * computed from WHOIS/Safe Browsing by a fixed rubric — the panel shows
   * both, labelled, rather than blending a measurement into an opinion.
   */
  trustworthinessScore: number;
  band: CompanyTrustBand;
  /** Short bullet observations — positives and concerns, mixed. */
  signals: string[];
  /** The model's confidence in the above. */
  confidence: CompanyTrustBand;
  /** ISO timestamp, so a stale profile can be re-run. */
  generatedAt: string;
};

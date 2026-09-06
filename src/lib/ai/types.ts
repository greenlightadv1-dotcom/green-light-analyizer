import type {
  AiEvaluation,
  CountryShare,
  SponsorshipType,
} from "@/lib/types/database";

/**
 * The evaluation payload — CLAUDE.md §7.4, field for field.
 *
 * Both the inbound-email pipeline (§5.4) and the Manual Analyzer (§5.1) build
 * this and hand it to the same function, so an offer that arrives by email and
 * one pasted into the analyzer are priced identically.
 */
export type EvaluationInput = {
  // Creator profile (§7.1)
  avg_views: number | null;
  avg_ccv: number | null;
  engagement_rate: number | null;
  content_category: string | null;
  content_language: string | null;

  /** Always present, always labelled self-reported in the UI (§7.2). */
  declared_top_countries: CountryShare[] | null;
  /** Only ever populated by an OAuth Analytics sync; null otherwise (§7.2). */
  verified_top_countries: CountryShare[] | null;
  audience_verified: boolean;

  // From the deal (§6.2)
  sponsorship_type: SponsorshipType;
  target_countries: string[] | null;
  offer_text: string;
};

export type EvaluationResult = {
  /** Midpoint recommendation, USD. */
  recommended_price_usd: number;
  price_range_usd: { low: number; high: number };
  risk: AiEvaluation;
  /** Short plain-language justification shown to the creator. */
  reasoning: string;
  /** Which geo field carried the pricing — drives the UI's verified badge. */
  geo_basis: "verified" | "declared" | "none";
  /** Which engine produced this. See evaluateOffer() for why this matters. */
  engine: "gemini" | "heuristic";
  /**
   * True when the §7.4 verification cap downgraded the rating — i.e. the
   * engine said green, but the audience data behind it is self-reported and
   * the deal is high-value.
   */
  risk_capped: boolean;
};

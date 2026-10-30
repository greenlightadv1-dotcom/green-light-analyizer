import type { AiEvaluation } from "@/lib/types/database";

/**
 * Pure business rules for deal evaluation.
 *
 * Kept free of "server-only" and of any I/O so it can be unit-tested directly
 * (see src/lib/ai/rules.test.ts) — these are the rules the product's
 * anti-fraud promise rests on, and they should not be reachable only through
 * a network call to the NVIDIA API.
 */

/**
 * Above this, a deal counts as "high value" for the §7.4 capping rule.
 *
 * Compared against highValueBasisUsd() — the greater of the stated offer and
 * the recommendation.
 *
 * OPEN QUESTION: §7.4 says the cap applies "when the deal's value is high"
 * without defining high. $1,000 is a placeholder chosen so a typical mid-tier
 * MENA integration sits below it and a dedicated-video deal sits above. Needs
 * a number from the client.
 */
export const HIGH_VALUE_DEAL_USD = 1000;

/**
 * The §7.4 weighting rule, applied to whatever the engine returned:
 *
 *   "If audience_verified is true, price using verified_top_countries against
 *    target_countries with full confidence. If false, still compute a
 *    recommendation from declared_top_countries, but the risk rating should be
 *    capped at yellow at best when the deal's value is high — i.e., unverified
 *    audience data should never by itself produce a green rating on a
 *    high-value deal."
 *
 * Applied in code rather than left to the prompt on purpose. A model can be
 * argued out of a rule by the offer text it is reading; this cannot.
 */
export function capRiskByVerification(
  risk: AiEvaluation,
  audienceVerified: boolean,
  dealValueUsd: number,
): { risk: AiEvaluation; risk_capped: boolean } {
  const unverifiedHighValueGreen =
    !audienceVerified &&
    risk === "green" &&
    dealValueUsd >= HIGH_VALUE_DEAL_USD;

  return unverifiedHighValueGreen
    ? { risk: "yellow", risk_capped: true }
    : { risk, risk_capped: false };
}

/**
 * The figure the §7.4 cap compares against HIGH_VALUE_DEAL_USD: the greater
 * of what the sponsor actually offered and what the engine recommends (owner
 * decision, 2026-10-30). Either side alone can make a deal high-value — a
 * lowball offer to a large creator, or a generous offer to a small one, are
 * both exactly the deals where unverified geography must not read as green.
 *
 * A missing, non-finite or non-positive value is ignored, so a deal with no
 * stated offer is judged on the recommendation alone (the behaviour before
 * this rule), and the cap can only ever become stricter, never looser.
 */
export function highValueBasisUsd(
  recommendedPriceUsd: number | null | undefined,
  offeredAmountUsd: number | null | undefined,
): number {
  const valid = [recommendedPriceUsd, offeredAmountUsd].filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0,
  );
  return valid.length ? Math.max(...valid) : 0;
}

/**
 * The unified Creator Plan (owner decision, 2026-10-31).
 *
 * Starter, Pro and Elite are retired. Every creator has the same access to
 * the creator features, and company access stays free. The old values are
 * still stored in profiles.subscription_plan (its CHECK constraint is
 * unchanged, no migration) but nothing reads them to decide access any more.
 *
 * No subscription price is listed: the owner has not set one, and this file
 * must not invent it. The commission is the one number that is decided.
 *
 * Every feature key below names something that is implemented and works
 * today. Integrations are not listed here: their status lives in
 * media-kit/platforms.ts (INTEGRATION_STATUS), the single source of truth the
 * Pricing page renders from.
 */

/** The commission on each completed deal, for every creator. */
export const CREATOR_COMMISSION = "10%";

/**
 * The day the single 10% rate took effect (owner decision, 2026-10-31):
 * immediately, with no 30-day wait, for every creator, including deals that
 * were open but not yet agreed on that day. Deals agreed, and commission
 * earned, before it keep the rate that applied when they were agreed (Terms
 * §6 and §14).
 *
 * A calendar date (YYYY-MM-DD), not a timestamp, so it reads the same in
 * every time zone. It must match the day this Terms revision is actually
 * published: if publication slips, move this date with it, and
 * LEGAL_LAST_UPDATED too, or the Terms would claim an effect before anyone
 * could read them. Nothing computes or stores commission: settlement is
 * manual, so this date governs what the team charges, not code.
 */
export const COMMISSION_EFFECTIVE_DATE = "2026-10-31";

/**
 * The effective date written out for `locale`, e.g. "31 October 2026".
 * Plain "en" is written the en-GB way, the same as the Terms and
 * LEGAL_LAST_UPDATED, so the pricing page and the Terms show one date format.
 */
export function formatCommissionEffectiveDate(locale: string): string {
  const tag = locale === "en" ? "en-GB" : locale;
  return new Intl.DateTimeFormat(tag, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${COMMISSION_EFFECTIVE_DATE}T00:00:00Z`),
  );
}

export type CreatorPlan = {
  nameKey: string;
  commission: string;
  /** Dictionary keys, one per implemented feature. */
  featureKeys: string[];
};

export const CREATOR_PLAN: CreatorPlan = {
  nameKey: "pricing.creatorName",
  commission: CREATOR_COMMISSION,
  featureKeys: [
    "pricing.featureAlias",
    "pricing.featureAnalyzer",
    "pricing.featureInbox",
    "pricing.featureNegotiation",
    "pricing.featureRiskChecks",
    "pricing.featureMediaKit",
    "pricing.featureVerifiedGeo",
    "pricing.featureSupport",
  ],
};

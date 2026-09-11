/**
 * Every fact the Terms and Privacy Policy assert about the operator lives
 * here, so filling in the blanks after incorporation is one edit rather than a
 * hunt through two long documents.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  UNRESOLVED — must be completed before these pages are relied on
 * ─────────────────────────────────────────────────────────────────────────
 * `ENTITY_NAME`, `ENTITY_ADDRESS` and `GOVERNING_LAW` are placeholders. The
 * pages render them as visibly unfinished rather than inventing a company,
 * because an agreement naming no real counterparty binds nobody, and a
 * fabricated one is worse than an obvious blank.
 *
 * This also gates the thing these documents were written for: Google's OAuth
 * verification and Meta's App Review both require a verified business, which
 * requires a registered entity. The documents can be published before then —
 * and should be, since the app collects data today — but neither review can
 * complete on a placeholder.
 */

/** Replace with the registered legal name once the entity exists. */
export const ENTITY_NAME = "[LEGAL ENTITY NAME]";

/** Replace with the registered office address. */
export const ENTITY_ADDRESS = "[REGISTERED ADDRESS]";

/** Replace with the agreed governing law and the courts that hear disputes. */
export const GOVERNING_LAW = "[GOVERNING LAW AND JURISDICTION]";

/** True while the three values above are still placeholders. Drives the banner. */
export const LEGAL_ENTITY_UNRESOLVED = true;

/**
 * Where data-protection requests go. A support channel alone does not satisfy
 * GDPR Art. 15–21, and a reviewer expects an address on the product's own
 * domain rather than free webmail.
 */
export const PRIVACY_EMAIL = "privacy@greenlight.com";

/** General enquiries that are not data-protection requests. */
export const SUPPORT_EMAIL = "support@greenlight.com";

/**
 * Both documents carry the same date so a reader can tell at a glance whether
 * they are looking at one revision or two. Update on every substantive change.
 */
export const LEGAL_LAST_UPDATED = "11 September 2026";

/** Retention after account closure, stated identically in both documents. */
export const RETENTION = {
  dealsAndMessagesMonths: 24,
  violationLogsMonths: 24,
} as const;

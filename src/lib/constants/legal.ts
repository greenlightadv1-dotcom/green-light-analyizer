/**
 * Every fact the Terms and Privacy Policy assert about the operator lives
 * here, so a change after incorporation is one edit rather than a hunt through
 * two long documents.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  Rule for this file: nothing in it may be invented.
 * ─────────────────────────────────────────────────────────────────────────
 * These values are rendered inside a binding agreement and are cross-checked
 * by Google's OAuth verification and Meta's App Review against public company
 * records. A plausible-looking but fictitious registered name, address or
 * commercial-register number is not a placeholder — it is a false statement
 * about a counterparty's identity, it fails those reviews harder than a blank,
 * and it makes the agreement unenforceable.
 *
 * So a value that is not yet known is left as an empty string, and every page
 * that renders it omits that clause entirely rather than printing a bracket.
 * The documents read as finished at every stage; they simply say less until
 * there is more that is true to say.
 */

/**
 * The name the service trades under and contracts in. This is real: it is the
 * brand, the domain and the sending identity.
 *
 * If the business is later incorporated under a different registered name, set
 * `ENTITY_REGISTERED_NAME` below; the documents then name both, which is what
 * both GDPR Art. 13(1)(a) and Egypt's PDPL Art. 2 require of a controller.
 */
export const ENTITY_NAME = "Greenlight Advs";

/**
 * The registered legal name, if it differs from the trading name above.
 * Empty until the entity exists. Never guess it.
 */
export const ENTITY_REGISTERED_NAME = "";

/**
 * Registered office address. Empty until there is a real one on file.
 *
 * Required before submitting to Google OAuth verification or Meta App Review:
 * both check it against the business records behind the domain.
 */
export const ENTITY_ADDRESS = "";

/**
 * Commercial register number and tax card number, as issued by the Egyptian
 * General Authority for Investment and the Egyptian Tax Authority. Empty until
 * issued.
 */
export const ENTITY_REGISTRATION = "";

/** Governing law. Egypt is the operating jurisdiction and primary market. */
export const GOVERNING_LAW = "the laws of the Arab Republic of Egypt";

/** The forum for any dispute that is not resolved informally. */
export const GOVERNING_FORUM = "the competent courts of Cairo, Arab Republic of Egypt";

/**
 * Where data-protection requests go. A support channel alone does not satisfy
 * GDPR Art. 15–22 or PDPL Art. 2, and a reviewer expects an address on the
 * product's own domain rather than free webmail.
 */
export const PRIVACY_EMAIL = "privacy@greenlightadvs.com";

/** General enquiries that are not data-protection requests. */
export const SUPPORT_EMAIL = "support@greenlightadvs.com";

/** Security reports, kept separate so they are not lost in support volume. */
export const SECURITY_EMAIL = "security@greenlightadvs.com";

/**
 * Both documents carry the same date so a reader can tell at a glance whether
 * they are looking at one revision or two. Update on every substantive change.
 */
export const LEGAL_LAST_UPDATED = "24 September 2026";

/** Notice given before a material change takes effect. */
export const CHANGE_NOTICE_DAYS = 30;

/** Statutory response deadline for a data-subject request. */
export const DSR_RESPONSE_DAYS = 30;

/** Retention after account closure, stated identically in both documents. */
export const RETENTION = {
  dealsAndMessagesMonths: 24,
  violationLogsMonths: 24,
  /** Commercial books, per Egyptian Commercial Code Law 17/1999 Art. 24. */
  financialRecordsYears: 5,
} as const;

/**
 * The operator's identity as a single sentence, assembled from whichever of
 * the values above are actually known. Used by both documents so they can
 * never disagree about who the counterparty is.
 */
export function operatorIdentity(): string {
  const registered =
    ENTITY_REGISTERED_NAME && ENTITY_REGISTERED_NAME !== ENTITY_NAME
      ? `${ENTITY_NAME}, trading name of ${ENTITY_REGISTERED_NAME}`
      : ENTITY_NAME;

  const parts = [registered];
  if (ENTITY_REGISTRATION) parts.push(ENTITY_REGISTRATION);
  if (ENTITY_ADDRESS) parts.push(`of ${ENTITY_ADDRESS}`);

  return parts.join(", ");
}

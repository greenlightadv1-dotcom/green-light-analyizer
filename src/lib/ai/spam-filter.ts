import "server-only";

/**
 * Best-effort spam/notification classifier for inbound-forwarded email (§5).
 *
 * Heuristic, not a model call — cheap enough to run on every inbound
 * delivery with no added latency or per-message AI cost, and honest about
 * being a first-pass filter rather than a verdict. It is never used to drop
 * a delivery: the intake pipeline still creates the deal room and stores the
 * message either way (see lib/email/intake.ts), only setting
 * deal_chats.is_likely_sponsorship so the inbox can let a creator hide what
 * it flags rather than silently lose a real offer to a false positive.
 *
 * Always true for the Manual Analyzer and Discover-originated deals — a
 * human deliberately created those, so there is nothing to classify.
 */

const NOTIFICATION_PATTERNS = [
  /unsubscribe/i,
  /no-?reply@/i,
  /newsletter/i,
  /verify your (email|account)/i,
  /password reset/i,
  /receipt|invoice|order confirmation/i,
  /security alert/i,
  /\bOTP\b|one-time (code|password)/i,
  /your (weekly|monthly) (digest|summary)/i,
];

const SPONSORSHIP_SIGNAL_PATTERNS = [
  /sponsor(ship)?/i,
  /collab(oration)?/i,
  /partner(ship)?/i,
  /paid (promotion|post|review)/i,
  /brand deal/i,
  /\bbudget\b/i,
  /\$\s?\d/,
  /rate card/i,
  /content creator/i,
  /influencer/i,
];

/**
 * True = looks like a real sponsorship offer. False = looks like a
 * notification/newsletter/transactional email. A notification-pattern match
 * in the subject only disqualifies the message when the combined text also
 * carries no sponsorship signal — "Re: Sponsorship — receipt attached" is a
 * real thread, not spam, and should not be flagged just for saying "receipt."
 */
export function classifySponsorship(subject: string, bodyText: string): boolean {
  const hasNotificationSignal = NOTIFICATION_PATTERNS.some((re) => re.test(subject));
  if (!hasNotificationSignal) return true;

  const combined = `${subject}\n${bodyText}`;
  return SPONSORSHIP_SIGNAL_PATTERNS.some((re) => re.test(combined));
}

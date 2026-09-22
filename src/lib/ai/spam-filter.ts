/**
 * Inbound screener for forwarded email (§5).
 *
 * Heuristic, not a model call — it runs on every delivery before anything is
 * spent, so it has to be free and instant. A model call here would invert the
 * economics it exists to protect: the whole point is to decide *whether* this
 * delivery is worth an evaluation, and paying for an evaluation to find out
 * defeats it.
 *
 * Deliberately not marked `server-only`, unlike the rest of lib/ai: this is a
 * pure function over text with no key, no client and no I/O, and it is only
 * ever called from the intake pipeline. Dropping the marker is what makes the
 * rubric testable at all — `server-only` throws under the plain Node test
 * runner — and it follows lib/mask.ts, which is importable for exactly the
 * same reason.
 *
 * Three verdicts, not two:
 *
 *   accept  — treat as a real offer. Deal room, AI evaluation, alert.
 *   flag    — store it, but mark it (deal_chats.is_likely_sponsorship = false)
 *             so the inbox can fold it away. Borderline: the creator decides.
 *   reject  — refuse the delivery. No deal room, no stored body, no AI call,
 *             no WhatsApp alert. Only the inbound_emails audit row, carrying
 *             the subject, the score and the rules that fired.
 *
 * `reject` is new, and it is the one that can do harm, so the rubric below is
 * deliberately lopsided: rejection requires a *machine-declared* signal that
 * this is not a person writing to a person — a List-Unsubscribe header, a
 * Precedence: bulk, an auto-responder marker, a no-reply sender — *and*
 * nothing sponsorship-like anywhere in the message. Prose alone never
 * rejects, however spammy it reads: a marketer's clumsy cold outreach is
 * exactly what this product exists to receive.
 *
 * What deliberately does NOT reject:
 *
 *   - SPF/DKIM/DMARC failure. Plain forwarding breaks SPF by design (the
 *     forwarding server is not in the original sender's SPF record), and
 *     every delivery here arrives via a creator's Gmail forwarding rule. An
 *     auth failure is a real signal, so it costs points and can push a
 *     borderline message to `flag` — but on its own it describes the
 *     forwarding path, not the sender.
 *   - Scam-shaped sponsorship offers (the "download the brief from this
 *     link" malware pattern). Those carry every sponsorship signal there is,
 *     and they must reach the creator with a red rating rather than vanish
 *     silently. Judging them is runSecurityCheck's and the Co-Pilot's job,
 *     not this function's.
 */

export type ScreenVerdict = "accept" | "flag" | "reject";

export type ScreenResult = {
  verdict: ScreenVerdict;
  /** 0-100. Higher = more likely a real sponsorship offer. */
  score: number;
  /** Every rule that actually fired, in plain language, for the audit row. */
  reasons: string[];
};

export type ScreenInput = {
  subject: string;
  bodyText: string;
  /** Normalized sender address, or null when the delivery carried none. */
  from: string | null;
  /** Lowercased header names → values, as far as the provider gave them. */
  headers?: Record<string, string>;
};

/** Below this, refuse the delivery outright. */
const REJECT_BELOW = 25;
/** Below this (but at or above REJECT_BELOW), store it folded away. */
const FLAG_BELOW = 50;

const START_SCORE = 60;

/**
 * Local-parts that cannot receive a reply. A deal room's entire purpose is the
 * reply path back to the sponsor (§6 relays the creator's answer to exactly
 * this address), so a room anchored to one of these is born broken.
 */
const UNREPLYABLE_LOCAL = /^(no-?reply|donotreply|do-not-reply|bounce[s]?|mailer-daemon|postmaster|notifications?|alerts?|automated|noreply-?[a-z0-9]*)$/i;

const NOTIFICATION_PATTERNS: [RegExp, string][] = [
  [/unsubscribe/i, "mentions unsubscribing"],
  [/newsletter|digest\b/i, "reads as a newsletter"],
  [/verify your (email|account)|confirm your (email|account)/i, "account verification mail"],
  [/password reset|reset your password/i, "password reset mail"],
  [/receipt|invoice|order (confirmation|#)|your order/i, "transactional receipt"],
  [/security alert|new sign-?in|unusual activity/i, "security notification"],
  [/\bOTP\b|one-time (code|password)|verification code/i, "one-time code"],
  [/your (weekly|monthly|daily) (digest|summary|report)/i, "periodic digest"],
  [/shipping|tracking number|out for delivery/i, "shipping notification"],
];

const SPONSORSHIP_PATTERNS: [RegExp, string][] = [
  [/sponsor(ship|ing|ed)?\b/i, "mentions sponsorship"],
  [/collab(orat\w+)?\b/i, "mentions a collaboration"],
  [/partner(ship|ing)?\b/i, "mentions a partnership"],
  [/paid (promotion|post|review|partnership)/i, "mentions a paid promotion"],
  [/brand deal|brand ambassador/i, "mentions a brand deal"],
  [/\bbudget\b|\bfee\b|\brate card\b/i, "discusses budget or rates"],
  [/\$\s?\d|\busd\b|\beur\b/i, "names a figure"],
  [/content creator|influencer|your (channel|content|audience|videos)/i, "addresses the creator's channel"],
  [/dedicated video|integration|shout-?out|mid-?roll|story (post|share)/i, "names a deliverable"],
  [/media kit|press kit/i, "asks for a media kit"],
];

/**
 * Headers a sender sets to declare "this is a mailing, not correspondence."
 * Each is a machine-readable assertion by the *sending* system about its own
 * message, which is why these are the only signals trusted enough to reject
 * on their own — unlike prose, they are not a guess about intent.
 */
function bulkHeaderReasons(headers: Record<string, string>): string[] {
  const reasons: string[] = [];

  if (headers["list-unsubscribe"] || headers["list-id"]) {
    reasons.push("carries mailing-list headers (List-Unsubscribe / List-ID)");
  }

  const precedence = headers["precedence"]?.toLowerCase().trim();
  if (precedence === "bulk" || precedence === "list" || precedence === "junk") {
    reasons.push(`sender marked it Precedence: ${precedence}`);
  }

  const autoSubmitted = headers["auto-submitted"]?.toLowerCase().trim();
  if (autoSubmitted && autoSubmitted !== "no") {
    reasons.push(`sender marked it Auto-Submitted: ${autoSubmitted}`);
  }

  if (headers["x-autoreply"] || headers["x-autorespond"]) {
    reasons.push("is an auto-responder");
  }

  return reasons;
}

/** "dmarc=fail", "spf=softfail" etc. out of an Authentication-Results header. */
function authFailures(headers: Record<string, string>): string[] {
  const raw = headers["authentication-results"] ?? "";
  if (!raw) return [];

  const failures: string[] = [];
  for (const mechanism of ["dmarc", "dkim", "spf"]) {
    const match = raw.match(new RegExp(`\\b${mechanism}=(\\w+)`, "i"));
    const verdict = match?.[1]?.toLowerCase();
    if (verdict === "fail" || verdict === "softfail") {
      failures.push(`${mechanism.toUpperCase()} ${verdict}`);
    }
  }
  return failures;
}

function localPart(address: string): string {
  return address.slice(0, address.lastIndexOf("@"));
}

/**
 * Screen one delivery. Pure and total — it never throws and never calls out,
 * so a delivery can always be given a verdict.
 */
export function screenInboundEmail(input: ScreenInput): ScreenResult {
  const headers = input.headers ?? {};
  const subject = input.subject ?? "";
  const body = input.bodyText ?? "";
  const combined = `${subject}\n${body}`;

  const reasons: string[] = [];
  let score = START_SCORE;
  // Set by signals that mean "no human is expecting a reply to this".
  let machineDeclaredBulk = false;

  const bulk = bulkHeaderReasons(headers);
  if (bulk.length) {
    machineDeclaredBulk = true;
    score -= 45;
    reasons.push(...bulk);
  }

  if (input.from && UNREPLYABLE_LOCAL.test(localPart(input.from))) {
    machineDeclaredBulk = true;
    score -= 45;
    reasons.push("sent from an address that cannot receive replies");
  }

  const notifications = NOTIFICATION_PATTERNS.filter(([re]) => re.test(subject));
  if (notifications.length) {
    score -= 25;
    reasons.push(`subject ${notifications.map(([, why]) => why).join(", ")}`);
  }

  const sponsorship = SPONSORSHIP_PATTERNS.filter(([re]) => re.test(combined));
  if (sponsorship.length) {
    // Capped: ten weak mentions are not ten times one strong one, and an
    // uncapped bonus would let a spammer keyword-stuff past the screen.
    score += Math.min(40, sponsorship.length * 12);
    reasons.push(`${sponsorship.map(([, why]) => why).join(", ")}`);
  }

  const failures = authFailures(headers);
  if (failures.length) {
    // Costs points, never decides on its own — see the module note on
    // forwarding breaking SPF for every single delivery here.
    score -= 12;
    reasons.push(`sender authentication: ${failures.join(", ")}`);
  }

  if (body.trim().length < 40 && !sponsorship.length) {
    score -= 15;
    reasons.push("almost no readable body");
  }

  score = Math.max(0, Math.min(100, score));

  // All three conditions, never any one of them:
  //
  //   machineDeclaredBulk — the sending system itself said this is a mailing,
  //     not correspondence. Without it, a low score only ever folds the
  //     message away; it cannot delete it.
  //   no sponsorship signal — a real offer sent through a marketing platform
  //     (which is how agencies send outreach at scale, List-Unsubscribe
  //     header and all) still reaches the creator.
  //   score below the floor — so a single rule firing is never enough.
  const rejected = machineDeclaredBulk && !sponsorship.length && score < REJECT_BELOW;

  const verdict: ScreenVerdict = rejected
    ? "reject"
    : score < FLAG_BELOW
      ? "flag"
      : "accept";

  return { verdict, score, reasons };
}

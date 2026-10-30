/**
 * Gmail forwarding confirmation — CLAUDE.md §5 step 2 (Stage 0, D4).
 *
 * When a creator adds their alias as a forwarding address, Gmail mails the
 * alias a confirmation from `forwarding-noreply@google.com` whose subject
 * begins `(#<code>) …` in every interface language. Before this, the screener
 * accepted it (the no-reply rule is anchored, so `forwarding-noreply` did not
 * match) and it opened a "sponsorship" deal room, spent an evaluation and
 * fired a WhatsApp alert — while the setup guide told the creator it was
 * accepted automatically, which nothing did.
 *
 * Now the intake recognises it, creates no room, runs no evaluation and sends
 * no alert, and the Deal Inbox's held panel shows the creator the code to type
 * into Gmail's Forwarding settings. The confirmation link is **never** visited
 * by the server: the sender address is not proof of origin, and clicking would
 * let anyone who can mail an alias attach a forwarding rule to it. Only the
 * digits are ever shown, so a forged "confirmation" can put nothing but a
 * number on the creator's screen — and a wrong number simply fails in Gmail.
 *
 * Pure — unit-tested in gmail-confirmation.test.ts.
 */

export const GMAIL_FORWARDING_SENDER = "forwarding-noreply@google.com";

/** Stored in inbound_emails.detail; held.ts allowlists on it. */
export const GMAIL_CONFIRMATION_DETAIL = "gmail forwarding confirmation";

const SUBJECT_CODE = /^\s*\(#(\d{6,12})\)/;

/** The confirmation code from a Gmail forwarding-confirmation subject, or null. */
export function confirmationCodeFromSubject(subject: string | null | undefined): string | null {
  return subject?.match(SUBJECT_CODE)?.[1] ?? null;
}

/**
 * True when the delivery is Gmail's forwarding confirmation: the exact Google
 * sender, the `(#code)` subject, and — when the receiving server reported
 * one — no DKIM or DMARC failure. Confirmations come straight from Google to
 * the alias (they are not themselves forwarded), so unlike the rest of the
 * intake an authentication failure here does mean "not from Google".
 */
export function isGmailForwardingConfirmation(input: {
  from: string | null;
  subject: string | null | undefined;
  headers?: Record<string, string>;
  /** Resend's received-email `authentication` object ({ spf, dkim, dmarc }), as fetched. */
  authentication?: unknown;
}): boolean {
  if ((input.from ?? "").trim().toLowerCase() !== GMAIL_FORWARDING_SENDER) return false;
  if (!confirmationCodeFromSubject(input.subject)) return false;

  const auth = input.headers?.["authentication-results"] ?? "";
  if (/\b(dkim|dmarc)=(fail|softfail|permerror)\b/i.test(auth)) return false;

  if (input.authentication && typeof input.authentication === "object") {
    const verdicts = input.authentication as Record<string, unknown>;
    for (const mechanism of ["dkim", "dmarc"]) {
      const v = verdicts[mechanism];
      if (typeof v === "string" && /^(fail|softfail|permerror)$/i.test(v.trim())) return false;
    }
  }
  return true;
}

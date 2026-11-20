/**
 * Role mailboxes on the root domain (support@, privacy@, security@ …).
 *
 * Resend receives the whole root domain and sends every delivery to the same
 * webhook as creator aliases. Before this module the intake treated mail to
 * the addresses published on the Support page and in the legal pages as an
 * unknown alias and rejected it: nobody ever received it (diagnosed in
 * docs/EMAIL_FORWARDING_DIAGNOSTIC.md). Such mail is now recognised here and
 * forwarded, server-side, to the operator inbox in ROLE_MAILBOX_FORWARD_TO.
 *
 * Pure apart from `forwardTarget()`, which reads the environment.
 */

export const ROLE_MAILBOX_DOMAIN = "greenlightadvs.com";
/** Local parts that are published or used as a platform reply path. */
export const ROLE_MAILBOXES = ["support", "privacy", "security", "legal", "deals"] as const;
export type RoleMailbox = (typeof ROLE_MAILBOXES)[number];

const EMAIL = /^[^\s@<>()",;]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** The first recipient that is one of our role mailboxes, or null. */
export function roleMailboxIn(recipients: readonly string[], domain = ROLE_MAILBOX_DOMAIN): RoleMailbox | null {
  for (const r of recipients) {
    const at = r.toLowerCase().lastIndexOf("@");
    if (at < 1 || r.slice(at + 1).toLowerCase() !== domain) continue;
    const local = r.slice(0, at).toLowerCase();
    if ((ROLE_MAILBOXES as readonly string[]).includes(local)) return local as RoleMailbox;
  }
  return null;
}

/** The operator inbox, or null when unset or malformed. Never a role mailbox (that would loop). */
export function forwardTarget(raw = process.env.ROLE_MAILBOX_FORWARD_TO): string | null {
  const v = raw?.trim();
  if (!v || !EMAIL.test(v)) return null;
  if (roleMailboxIn([v])) return null;
  return v;
}

/** The forwarded message. The original sender becomes Reply-To, so the operator can answer directly. */
export function buildForward(input: {
  role: RoleMailbox;
  from: string;
  fromName: string | null;
  subject: string;
  text: string;
  attachmentNames: string[];
}): { subject: string; text: string; replyTo: string } {
  const lines = [
    `Received at ${input.role}@${ROLE_MAILBOX_DOMAIN}`,
    `From: ${input.fromName ? `${input.fromName} <${input.from}>` : input.from}`,
    `Subject: ${input.subject || "(no subject)"}`,
    input.attachmentNames.length ? `Attachments (not forwarded; open the original in Resend): ${input.attachmentNames.join(", ")}` : "",
    "",
    input.text || "(no readable text)",
  ].filter((l, i) => l !== "" || i === 4);
  return {
    subject: `[${input.role}] ${input.subject || "(no subject)"}`.slice(0, 300),
    text: lines.join("\n").slice(0, 100_000),
    replyTo: input.from,
  };
}

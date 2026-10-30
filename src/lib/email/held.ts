import { maskSensitiveData } from "../mask.ts";
import {
  GMAIL_CONFIRMATION_DETAIL,
  GMAIL_FORWARDING_SENDER,
  confirmationCodeFromSubject,
} from "./gmail-confirmation.ts";

/**
 * What a creator may see about a delivery the screener refused (§5).
 *
 * Pure — no I/O, no `server-only` — so the projection and the allowlist are
 * testable. The query that feeds it lives in held-queries.ts.
 *
 * ───────────────────────────────────────────────────────────────────────────
 *  Why this is a projection and not an RLS policy
 * ───────────────────────────────────────────────────────────────────────────
 * `inbound_emails` is admin-read under RLS (0008), and it stays that way. A
 * `creator_id = auth.uid()` policy would gate rows but not columns, so a
 * creator could `select *` through PostgREST and read the raw subject — which
 * is stored unmasked, because masking runs on message bodies, not on this
 * audit row — along with `detail`, `spam_score`, `spam_reasons` and the
 * provider's message id. Instead the server reads the row, and this module
 * decides field by field what leaves.
 *
 * The subject is masked with the same §6.1 utility the chat uses. That is not
 * only about privacy: a held newsletter or a spammer's subject line is exactly
 * where a WhatsApp number lands, and showing it would hand the creator a
 * direct, off-platform channel to the sender — the bypass §1's commission
 * model exists to close.
 */

/** Why a delivery was held, in a form the UI can translate. */
export type HeldReason = "bulk" | "noReply" | "empty" | "screened" | "forwardingConfirmation";

export type HeldDelivery = {
  id: string;
  receivedAt: string;
  /**
   * The sending address, unmasked. Deliberately: the deal room already shows
   * a sender's address as its title, this mail is in the creator's own Gmail
   * (they forwarded it from there), and without it the creator cannot answer
   * the one question this exists for — "which email was it?". It is the
   * creator's own inbound mail, so §6, which protects the creator's address
   * from companies, is not engaged.
   */
  sender: string;
  /** Masked. Empty when the delivery had none. */
  subject: string;
  /** True when masking removed something from the subject. */
  subjectRedacted: boolean;
  reason: HeldReason;
  /** Digits only, and only for a Gmail forwarding confirmation (D4). */
  confirmationCode: string | null;
};

/** What the inbox receives: the held items and whether the list was capped. */
export type HeldDeliveries = {
  items: HeldDelivery[];
  /** True when more exist in the window than were returned. */
  truncated: boolean;
};

/** The columns the projection reads. Exactly these, and no others. */
export type HeldRow = {
  id: string;
  created_at: string | null;
  sender_email: string | null;
  subject: string | null;
  detail: string | null;
  spam_score: number | null;
  spam_reasons: string[] | null;
};

/**
 * The `detail` intake writes for a delivery with no readable body. Shared
 * with intake.ts rather than duplicated, because this module allowlists on it:
 * if the two strings drifted apart, empty deliveries would silently vanish
 * from the creator's view — the exact failure this feature exists to end.
 */
export const EMPTY_BODY_DETAIL = "delivery had no readable body";

/**
 * Which held deliveries a creator is shown at all. An allowlist, not a
 * denylist: a rejection reason added to intake later stays admin-only until
 * someone decides what a creator should read about it, rather than appearing
 * with a message nobody wrote for them.
 *
 *   - A screener refusal. Identified structurally — only the screener writes a
 *     score — not by matching prose in `detail`.
 *   - A delivery with no readable body.
 *
 * Deliberately excluded: "account is suspended" (a suspended creator cannot
 * reach this page, and the reason is not theirs to see as an inbox item),
 * and every rejection with no creator attached — those never matched this
 * account in the first place.
 */
export function isShownToCreator(row: HeldRow): boolean {
  return (
    row.spam_score !== null ||
    row.detail === EMPTY_BODY_DETAIL ||
    row.detail === GMAIL_CONFIRMATION_DETAIL
  );
}

const BULK = /mailing-list|precedence|auto-submitted|auto-responder/i;
const NO_REPLY = /cannot receive replies/i;

/**
 * The screener's rules, folded into four categories a creator can act on.
 * The raw rule strings stay server-side: they are written for an operator
 * tuning the rubric, in English, and say more about how the filter works than
 * a creator needs.
 */
export function classifyHeldReason(row: HeldRow): HeldReason {
  if (row.detail === EMPTY_BODY_DETAIL) return "empty";
  if (row.detail === GMAIL_CONFIRMATION_DETAIL) return "forwardingConfirmation";

  const reasons = (row.spam_reasons ?? []).join("\n");
  if (NO_REPLY.test(reasons)) return "noReply";
  if (BULK.test(reasons)) return "bulk";
  return "screened";
}

export function toHeldDelivery(row: HeldRow): HeldDelivery {
  const { maskedText, isMasked } = maskSensitiveData((row.subject ?? "").trim());
  const reason = classifyHeldReason(row);

  return {
    id: row.id,
    receivedAt: row.created_at ?? "",
    sender: row.sender_email ?? "",
    subject: maskedText,
    subjectRedacted: isMasked,
    reason,
    confirmationCode:
      reason === "forwardingConfirmation" &&
      (row.sender_email ?? "").toLowerCase() === GMAIL_FORWARDING_SENDER
        ? confirmationCodeFromSubject(row.subject)
        : null,
  };
}

/** Allowlist, then project. Order preserved: newest first, as queried. */
export function toHeldDeliveries(rows: HeldRow[]): HeldDelivery[] {
  return rows.filter(isShownToCreator).map(toHeldDelivery);
}

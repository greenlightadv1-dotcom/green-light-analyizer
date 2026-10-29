/**
 * How an intake outcome is answered to Resend — CLAUDE.md §5.3.
 *
 * Resend (Svix) redelivers anything that is not 2xx, on a schedule that backs
 * off from seconds to hours. So the status code is a decision about whether
 * this delivery deserves another attempt:
 *
 *   processed / rejected / unknown_alias → 200. Decided; a retry cannot help.
 *   failed      → 500. Our fault and possibly transient (a retryable content
 *                 fetch, a database error).
 *   in_progress → 503. Another execution holds a live claim on this email.
 *                 A 200 here was the old answer, and it told Resend the email
 *                 was handled when the run holding the claim might still die.
 *                 Retry-After is advisory; Svix keeps its own schedule.
 *
 * Pure, so the mapping is unit-tested (webhook-response.test.ts).
 */
export type IntakeStatus = "processed" | "unknown_alias" | "rejected" | "failed" | "in_progress";

export function webhookResponseFor(status: IntakeStatus): {
  httpStatus: number;
  headers: Record<string, string>;
} {
  switch (status) {
    case "failed":
      return { httpStatus: 500, headers: {} };
    case "in_progress":
      return { httpStatus: 503, headers: { "retry-after": "120" } };
    default:
      return { httpStatus: 200, headers: {} };
  }
}

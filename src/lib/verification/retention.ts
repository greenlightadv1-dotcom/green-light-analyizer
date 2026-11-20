/**
 * Retention of verification documents (docs/IDENTITY_DOCUMENT_SECURITY.md,
 * docs/REGISTRATION_ONBOARDING_FLOW.md).
 *
 * The period is the owner's approved decision: 12 months (365 days). It is
 * fixed here and in the database (migration 0040,
 * private.verification_purge_due), which refuses to mark any document purged
 * earlier, whoever asks. Changing it is a migration, not an environment
 * variable, so a typo can never delete evidence early.
 *
 * Due: the files of a case decided (approved or rejected) more than 365 days
 * ago, or abandoned in draft for 365 days. Cases waiting for review or for
 * more information are never due.
 *
 * Pure — tested in retention.test.ts.
 */

export const RETENTION_DAYS = 365;

export function retentionCutoff(days: number = RETENTION_DAYS, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

/** Which case states may have their files purged once older than the cutoff. */
export const PURGEABLE_STATUSES = ["approved", "rejected", "draft"] as const;

/** Mirrors private.verification_purge_due() (the database is the authority). */
export function isPurgeable(c: { status: string; reviewed_at: string | null; updated_at: string }, cutoff: string): boolean {
  if (!(PURGEABLE_STATUSES as readonly string[]).includes(c.status)) return false;
  const at = c.status === "draft" ? c.updated_at : c.reviewed_at;
  return !!at && at <= cutoff;
}

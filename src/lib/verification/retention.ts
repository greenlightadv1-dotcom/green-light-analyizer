/**
 * Retention of verification documents (docs/IDENTITY_DOCUMENT_SECURITY.md).
 *
 * No retention period is decided yet: it is an owner and legal decision
 * (Egypt PDPL 151/2020 review). Until VERIFICATION_RETENTION_DAYS is set,
 * nothing is purged and documents stay in the private bucket until a case or
 * application is deleted. Setting the variable enables the purge job
 * (/api/cron/verification-retention), which removes the files of DECIDED
 * cases (approved or rejected) and of applications abandoned in draft, older
 * than the period. Cases waiting for review are never purged.
 *
 * Pure — tested in retention.test.ts.
 */

export type RetentionConfig = { enabled: false } | { enabled: true; days: number };

/** Bounds keep a typo from deleting everything (0) or meaning "forever" (huge). */
export const RETENTION_BOUNDS = { minDays: 7, maxDays: 3650 } as const;

export function retentionConfig(env: Record<string, string | undefined> = process.env): RetentionConfig {
  const raw = env.VERIFICATION_RETENTION_DAYS?.trim();
  if (!raw || !/^\d+$/.test(raw)) return { enabled: false };
  const days = Number(raw);
  if (days < RETENTION_BOUNDS.minDays || days > RETENTION_BOUNDS.maxDays) return { enabled: false };
  return { enabled: true, days };
}

export function retentionCutoff(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

/** Which case states may have their files purged once older than the cutoff. */
export const PURGEABLE_STATUSES = ["approved", "rejected", "draft"] as const;

export function isPurgeable(c: { status: string; reviewed_at: string | null; updated_at: string }, cutoff: string): boolean {
  if (!(PURGEABLE_STATUSES as readonly string[]).includes(c.status)) return false;
  const at = c.status === "draft" ? c.updated_at : c.reviewed_at;
  return !!at && at < cutoff;
}

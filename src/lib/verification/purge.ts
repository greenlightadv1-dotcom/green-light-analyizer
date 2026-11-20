/**
 * One run of the retention purge (365 days, lib/verification/retention.ts).
 * The database decides what may go; this only sequences the steps, so a
 * failure at any point is retried and nothing is lost early:
 *
 *   1. retry   documents already marked purged whose file deletion was not
 *              confirmed (an earlier run failed or stopped): delete, confirm.
 *   2. mark    verification_purge_mark(): the database re-checks the 365-day
 *              rule, marks the row (removed from every view, metadata kept as
 *              the audit record) and writes a 'document_purged' event with no
 *              contents. Not due → skipped.
 *   3. delete  the stored file, by the exact name the database returned.
 *   4. confirm verification_purge_confirm().
 *
 * A failed deletion is recorded ('document_purge_failed', a code only) and the
 * row stays marked-but-unconfirmed, so the next run retries it. Deleting a
 * file that is already gone succeeds (storage removal is idempotent).
 *
 * Dependencies are injected so the sequence is unit-tested (purge.test.ts).
 */

export type PurgeDeps = {
  /** Documents marked purged but not confirmed deleted. */
  pending(limit: number): Promise<{ id: string; path: string }[]>;
  /** Not-yet-removed documents whose case looks due (the database re-checks). */
  candidates(limit: number): Promise<string[]>;
  mark(docId: string): Promise<{ path: string } | { skip: "not_due" | "not_found" } | { error: string }>;
  remove(path: string): Promise<{ ok: true } | { ok: false; code: string }>;
  confirm(docId: string): Promise<boolean>;
  failed(docId: string, code: string): Promise<void>;
};

export type PurgeReport = { retried: number; marked: number; deleted: number; failed: number; skipped: number };

export async function runPurge(deps: PurgeDeps, limit = 200): Promise<PurgeReport> {
  const report: PurgeReport = { retried: 0, marked: 0, deleted: 0, failed: 0, skipped: 0 };

  const finish = async (id: string, path: string) => {
    const removed = await deps.remove(path);
    if (!removed.ok) {
      report.failed++;
      await deps.failed(id, removed.code);
      return;
    }
    if (await deps.confirm(id)) report.deleted++;
    else report.failed++; // the file is gone; the next run confirms it
  };

  for (const p of await deps.pending(limit)) {
    report.retried++;
    await finish(p.id, p.path);
  }
  for (const id of await deps.candidates(limit)) {
    const m = await deps.mark(id);
    if ("skip" in m) {
      report.skipped++;
      continue;
    }
    if ("error" in m) {
      report.failed++;
      continue;
    }
    report.marked++;
    await finish(id, m.path);
  }
  return report;
}

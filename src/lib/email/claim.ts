/**
 * Idempotency for inbound deliveries — CLAUDE.md §5.3.
 *
 * The key is Resend's `email_id`: one per received message per recipient.
 * It used to be the RFC `Message-ID` header (`data.message_id`), which is the
 * same for every copy of an email. One sponsor writing to two creators, or one
 * email forwarded by two creators, produced one key, and the second creator's
 * copy was dropped as a "duplicate". `inbound_emails.provider_message_id` is a
 * unique text column, so this needs no schema change — only a different value
 * written into it. Rows written before the change keep their old keys; those
 * cannot collide with an `email_id`, which is a bare UUID, never `<…@…>`.
 *
 * Pure decision logic over a two-method store, so the claim / duplicate /
 * reclaim branches are unit-testable (claim.test.ts) without a database.
 */

/**
 * Prefix of `inbound_emails.detail` for a delivery whose content fetch failed
 * in a way a later attempt could fix. It is the one failure a provider retry is
 * allowed to re-claim (see reclaimAfterFetchFailure).
 */
export const CONTENT_FETCH_RETRYABLE_PREFIX = "content fetch failed:";

/** Detail prefix for a fetch failure that no retry can fix. */
export const CONTENT_FETCH_PERMANENT_PREFIX = "content unavailable:";

export type DeliveryStore = {
  /** Insert the claim row. Resolves to the Postgres error code on failure. */
  insertClaim(): Promise<{ errorCode: string | null; errorMessage: string | null }>;
  /**
   * Atomically take over a row left behind by a retryable fetch failure:
   * `UPDATE … SET detail = 'processing' WHERE key = $1 AND status = 'failed'
   * AND detail LIKE 'content fetch failed:%'`. Resolves true when exactly
   * this call changed the row. Postgres re-checks the WHERE clause after a
   * concurrent writer commits, so two simultaneous retries cannot both win.
   */
  reclaimAfterFetchFailure(): Promise<boolean>;
};

export type ClaimResult =
  | { kind: "claimed" }
  | { kind: "reclaimed" }
  | { kind: "duplicate" }
  | { kind: "error"; message: string };

/** 23505 = unique_violation: this key has been seen before. */
export async function claimDelivery(store: DeliveryStore): Promise<ClaimResult> {
  const { errorCode, errorMessage } = await store.insertClaim();

  if (!errorCode && !errorMessage) return { kind: "claimed" };

  if (errorCode === "23505") {
    // Seen before. Only a delivery that stopped at the content fetch is worth
    // taking over; everything else — processed, rejected, or another failure —
    // keeps the existing behaviour and is acknowledged as a duplicate, so a
    // retry can never mint a second deal room or a second paid evaluation.
    return (await store.reclaimAfterFetchFailure()) ? { kind: "reclaimed" } : { kind: "duplicate" };
  }

  return { kind: "error", message: errorMessage ?? `database error ${errorCode}` };
}

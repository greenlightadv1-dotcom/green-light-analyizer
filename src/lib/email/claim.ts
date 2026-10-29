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
 * ## Claim states, with no new columns
 *
 * A claimed delivery that is still being worked is `status = 'failed'` (the
 * CHECK constraint from 0008 allows nothing more specific) with
 * `detail = 'processing since <ISO-8601 instant>'`. The timestamp is what tells
 * a live claim from one whose function was killed mid-run: the table has no
 * updated_at, and created_at records the first claim, not a reclaim. Rows from
 * the code before this change say just `'processing'`, and their created_at is
 * their claim time, because that code never re-claimed a row.
 *
 * Every takeover is a compare-and-swap on the exact `detail` value just read:
 * `UPDATE … SET detail = <new marker> WHERE key = $1 AND status = 'failed'
 * AND detail = $2`. Postgres re-evaluates that WHERE clause against the committed
 * row when two updates race, so exactly one of them changes it (verified
 * against a real Postgres by scripts/claim-concurrency-pg.sh). Comparing for
 * equality avoids depending on how the database collates timestamps-as-text.
 *
 * Pure decision logic over a three-method store, so every branch is
 * unit-testable (claim.test.ts) without a database.
 */

/**
 * Prefix of `inbound_emails.detail` for a delivery whose content fetch failed
 * in a way a later attempt could fix. Such a row may be re-claimed at once.
 */
export const CONTENT_FETCH_RETRYABLE_PREFIX = "content fetch failed:";

/** Detail prefix for a fetch failure that no retry can fix. */
export const CONTENT_FETCH_PERMANENT_PREFIX = "content unavailable:";

export const PROCESSING_PREFIX = "processing since ";
/** What the pre-timestamp code wrote. Dated by created_at. */
const LEGACY_PROCESSING = "processing";

/**
 * A claim older than this cannot still be running. The webhook route's
 * maxDuration is 60s, after which the platform kills the function; twice that
 * leaves room for clock skew between instances and a slow cold start, and is
 * still far shorter than Resend's retry schedule, whose later attempts come
 * minutes to hours apart.
 */
export const STALE_CLAIM_MS = 120_000;

export function processingMarker(now: number): string {
  return `${PROCESSING_PREFIX}${new Date(now).toISOString()}`;
}

export type ClaimRow = {
  status: string;
  detail: string | null;
  created_at: string | null;
  chat_id: string | null;
};

/** When the claim on a processing row was taken, or null if it is not one. */
export function claimTakenAt(row: ClaimRow): number | null {
  if (row.status !== "failed" || row.detail === null) return null;

  if (row.detail.startsWith(PROCESSING_PREFIX)) {
    const at = Date.parse(row.detail.slice(PROCESSING_PREFIX.length));
    // An unreadable marker is treated as ancient: refusing it forever would
    // turn a corrupted row into a permanently lost delivery.
    return Number.isFinite(at) ? at : 0;
  }
  if (row.detail === LEGACY_PROCESSING) {
    const at = row.created_at ? Date.parse(row.created_at) : NaN;
    return Number.isFinite(at) ? at : 0;
  }
  return null;
}

export type DeliveryStore = {
  /** Insert the claim row. Resolves to the Postgres error, if any. */
  insertClaim(marker: string): Promise<{ errorCode: string | null; errorMessage: string | null }>;
  /** Read the existing row for this key. */
  readClaim(): Promise<ClaimRow | null>;
  /**
   * Atomically replace `detail` only if the row is still `status = 'failed'`
   * with exactly this detail (every claim state is a 'failed' row). Resolves
   * true when this call changed the row.
   */
  swapDetail(expectedDetail: string, next: string): Promise<boolean>;
};

export type ClaimResult =
  | { kind: "claimed" }
  | {
      kind: "reclaimed";
      reason: "retryable_fetch_failure" | "stale_claim";
      /** How long ago the abandoned claim was taken (stale only). */
      ageMs: number | null;
      /**
       * The deal room the earlier run had already recorded, if it got that far.
       * The intake then appends to that room instead of opening another.
       */
      priorChatId: string | null;
    }
  /** Another execution holds a live claim. The caller must let the provider retry. */
  | { kind: "in_progress"; ageMs: number | null }
  | { kind: "duplicate" }
  | { kind: "error"; message: string };

/** 23505 = unique_violation: this key has been seen before. */
export async function claimDelivery(
  store: DeliveryStore,
  now: number = Date.now(),
): Promise<ClaimResult> {
  const marker = processingMarker(now);
  const { errorCode, errorMessage } = await store.insertClaim(marker);

  if (!errorCode && !errorMessage) return { kind: "claimed" };
  if (errorCode !== "23505") {
    return { kind: "error", message: errorMessage ?? `database error ${errorCode}` };
  }

  const row = await store.readClaim();
  // Seen a moment ago and gone now: nothing deletes these rows in the app, so
  // this is an operator's hand. Answer retryably rather than guess.
  if (!row) return { kind: "error", message: "claim row disappeared" };

  const expected = row.status === "failed" ? row.detail : null;

  if (expected !== null && expected.startsWith(CONTENT_FETCH_RETRYABLE_PREFIX)) {
    return (await store.swapDetail(expected, marker))
      ? { kind: "reclaimed", reason: "retryable_fetch_failure", ageMs: null, priorChatId: row.chat_id }
      : // Lost the race: the other redelivery is working on it right now.
        { kind: "in_progress", ageMs: 0 };
  }

  const takenAt = claimTakenAt(row);
  if (expected !== null && takenAt !== null) {
    const ageMs = Math.max(now - takenAt, 0);
    if (ageMs < STALE_CLAIM_MS) return { kind: "in_progress", ageMs };
    return (await store.swapDetail(expected, marker))
      ? { kind: "reclaimed", reason: "stale_claim", ageMs, priorChatId: row.chat_id }
      : { kind: "in_progress", ageMs: 0 };
  }

  // Finished one way or another: processed, rejected, unknown alias, a
  // permanent fetch failure, or a failure after the content was fetched. A
  // retry of those must never mint a second deal room or a second paid
  // evaluation, so it is acknowledged and dropped.
  return { kind: "duplicate" };
}

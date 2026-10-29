import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  CONTENT_FETCH_PERMANENT_PREFIX,
  CONTENT_FETCH_RETRYABLE_PREFIX,
  PROCESSING_PREFIX,
  STALE_CLAIM_MS,
  claimDelivery,
  claimTakenAt,
  processingMarker,
  type ClaimRow,
  type DeliveryStore,
} from "./claim.ts";
import { normalizeInboundEmail } from "./parse.ts";
import { RFC_MESSAGE_ID, webhookPayload } from "./fixtures/resend.ts";

/**
 * §5.3 claim decisions. The store below is an in-memory stand-in for
 * inbound_emails with the two properties the intake relies on: a unique key,
 * and a compare-and-swap that only one caller can win. It proves the
 * *decisions*; it does not prove Postgres's locking — that is
 * scripts/claim-concurrency-pg.sh, against a real Postgres.
 */
const NOW = Date.parse("2026-10-29T12:00:00.000Z");

function table() {
  const rows = new Map<string, ClaimRow>();
  const swaps: string[] = [];
  const store = (key: string): DeliveryStore => ({
    async insertClaim(marker) {
      if (rows.has(key)) return { errorCode: "23505", errorMessage: "duplicate key value" };
      rows.set(key, { status: "failed", detail: marker, created_at: new Date(NOW).toISOString(), chat_id: null });
      return { errorCode: null, errorMessage: null };
    },
    async readClaim() {
      const row = rows.get(key);
      return row ? { ...row } : null;
    },
    async swapDetail(expectedDetail, next) {
      // Yield first, so two racing callers both read before either swaps —
      // the interleaving a real race produces.
      await Promise.resolve();
      const row = rows.get(key);
      if (!row || row.status !== "failed" || row.detail !== expectedDetail) return false;
      row.detail = next;
      swaps.push(next);
      return true;
    },
  });
  return { rows, store, swaps };
}

const ago = (ms: number) => processingMarker(NOW - ms);

test("the first delivery is claimed with a dated processing marker", async () => {
  const { store, rows } = table();
  assert.deepEqual(await claimDelivery(store("e1"), NOW), { kind: "claimed" });
  assert.equal(rows.get("e1")?.detail, `${PROCESSING_PREFIX}2026-10-29T12:00:00.000Z`);
  assert.equal(claimTakenAt(rows.get("e1")!), NOW);
});

test("a normal duplicate delivery of a finished email is dropped", async () => {
  for (const finished of [
    { status: "processed", detail: "created a deal room" },
    { status: "rejected", detail: "screened out: carries mailing-list headers" },
    { status: "rejected", detail: `${CONTENT_FETCH_PERMANENT_PREFIX} HTTP 404` },
    { status: "unknown_alias", detail: "alias matched no account" },
    // Unchanged on purpose: a failure after the content was fetched is not
    // re-run automatically, so a retry can never pay for a second evaluation.
    { status: "failed", detail: "could not create deal room: boom" },
  ]) {
    const { store, rows, swaps } = table();
    rows.set("e1", { ...finished, created_at: null, chat_id: null });
    assert.deepEqual(await claimDelivery(store("e1"), NOW), { kind: "duplicate" }, finished.detail);
    assert.equal(rows.get("e1")?.detail, finished.detail, "row untouched");
    assert.equal(swaps.length, 0);
  }
});

test("a retryable content-fetch failure is reclaimed immediately", async () => {
  const { store, rows } = table();
  rows.set("e1", { status: "failed", detail: `${CONTENT_FETCH_RETRYABLE_PREFIX} HTTP 503`, created_at: null, chat_id: null });
  const result = await claimDelivery(store("e1"), NOW);
  assert.deepEqual(result, { kind: "reclaimed", reason: "retryable_fetch_failure", ageMs: null, priorChatId: null });
  assert.equal(rows.get("e1")?.detail, processingMarker(NOW));
});

test("a stale processing claim is recovered, carrying the room it recorded", async () => {
  const { store, rows } = table();
  rows.set("e1", { status: "failed", detail: ago(STALE_CLAIM_MS + 1), created_at: null, chat_id: "room-1" });
  const result = await claimDelivery(store("e1"), NOW);
  assert.deepEqual(result, { kind: "reclaimed", reason: "stale_claim", ageMs: STALE_CLAIM_MS + 1, priorChatId: "room-1" });
  assert.equal(rows.get("e1")?.detail, processingMarker(NOW), "re-dated, so it is live again");
});

test("a live processing claim is not reclaimed; the caller is told to retry", async () => {
  for (const age of [0, 1_000, 59_000, STALE_CLAIM_MS - 1]) {
    const { store, rows, swaps } = table();
    rows.set("e1", { status: "failed", detail: ago(age), created_at: null, chat_id: null });
    assert.deepEqual(await claimDelivery(store("e1"), NOW), { kind: "in_progress", ageMs: age });
    assert.equal(swaps.length, 0, `age ${age}ms must not be taken over`);
  }
});

test("a claim exactly at the threshold is stale", async () => {
  const { store, rows } = table();
  rows.set("e1", { status: "failed", detail: ago(STALE_CLAIM_MS), created_at: null, chat_id: null });
  assert.equal((await claimDelivery(store("e1"), NOW)).kind, "reclaimed");
});

test("pre-change 'processing' rows are dated by created_at", async () => {
  const legacy = (createdAgo: number) => ({
    status: "failed",
    detail: "processing",
    created_at: new Date(NOW - createdAgo).toISOString(),
    chat_id: null,
  });

  const fresh = table();
  fresh.rows.set("e1", legacy(10_000));
  assert.equal((await claimDelivery(fresh.store("e1"), NOW)).kind, "in_progress");

  const old = table();
  old.rows.set("e1", legacy(10 * 60_000));
  assert.equal((await claimDelivery(old.store("e1"), NOW)).kind, "reclaimed");
});

test("an unreadable marker counts as stale rather than blocking forever", async () => {
  const { store, rows } = table();
  rows.set("e1", { status: "failed", detail: `${PROCESSING_PREFIX}not-a-date`, created_at: null, chat_id: null });
  assert.equal((await claimDelivery(store("e1"), NOW)).kind, "reclaimed");
});

test("only processing rows are datable claims", () => {
  for (const detail of ["created a deal room", "processing-ish", `${CONTENT_FETCH_RETRYABLE_PREFIX} x`, null]) {
    assert.equal(claimTakenAt({ status: "failed", detail, created_at: null, chat_id: null }), null);
  }
  assert.equal(claimTakenAt({ status: "processed", detail: ago(0), created_at: null, chat_id: null }), null);
});

test("two concurrent recoveries of one stale claim: exactly one wins", async () => {
  const { store, rows, swaps } = table();
  rows.set("e1", { status: "failed", detail: ago(10 * 60_000), created_at: null, chat_id: null });
  const results = await Promise.all([claimDelivery(store("e1"), NOW), claimDelivery(store("e1"), NOW + 5)]);
  assert.deepEqual(results.map((r) => r.kind).sort(), ["in_progress", "reclaimed"]);
  assert.equal(swaps.length, 1);
});

test("two concurrent reclaims of a retryable failure: exactly one wins", async () => {
  const { store, rows, swaps } = table();
  rows.set("e1", { status: "failed", detail: `${CONTENT_FETCH_RETRYABLE_PREFIX} HTTP 503`, created_at: null, chat_id: null });
  const results = await Promise.all([claimDelivery(store("e1"), NOW), claimDelivery(store("e1"), NOW)]);
  assert.deepEqual(results.map((r) => r.kind).sort(), ["in_progress", "reclaimed"]);
  assert.equal(swaps.length, 1);
});

test("simultaneous first deliveries: one claims, the other sees a live claim", async () => {
  const { store } = table();
  const key = normalizeInboundEmail(webhookPayload()).providerMessageId!;
  const results = await Promise.all([1, 2, 3].map(() => claimDelivery(store(key), NOW)));
  assert.equal(results.filter((r) => r.kind === "claimed").length, 1);
  // Not "duplicate": the first is still running and might yet die, so the
  // others must leave the provider a reason to come back.
  assert.equal(results.filter((r) => r.kind === "in_progress").length, 2);
});

test("a database error other than a unique violation is reported", async () => {
  const store: DeliveryStore = {
    insertClaim: async () => ({ errorCode: "57014", errorMessage: "canceling statement" }),
    readClaim: async () => {
      throw new Error("must not be called");
    },
    swapDetail: async () => {
      throw new Error("must not be called");
    },
  };
  assert.deepEqual(await claimDelivery(store, NOW), { kind: "error", message: "canceling statement" });
});

test("a row that vanished between insert and read is an error, not a duplicate", async () => {
  const store: DeliveryStore = {
    insertClaim: async () => ({ errorCode: "23505", errorMessage: "duplicate" }),
    readClaim: async () => null,
    swapDetail: async () => false,
  };
  assert.equal((await claimDelivery(store, NOW)).kind, "error");
});

test("two copies of one email (same Message-ID) are two deliveries", async () => {
  // One sponsor mailing two creators: the RFC Message-ID is identical, the
  // Resend email_id is not. Keyed on Message-ID, the second copy was dropped.
  const first = normalizeInboundEmail(webhookPayload());
  const second = normalizeInboundEmail(
    webhookPayload({ email_id: "a9d2c0f4-0000-4000-8000-000000000002", received_for: ["other.x7q2@analyze.greenlightadvs.com"] }),
  );
  assert.notEqual(first.providerMessageId, second.providerMessageId);
  assert.notEqual(first.providerMessageId, RFC_MESSAGE_ID);

  const { store } = table();
  assert.deepEqual(await claimDelivery(store(first.providerMessageId!), NOW), { kind: "claimed" });
  assert.deepEqual(await claimDelivery(store(second.providerMessageId!), NOW), { kind: "claimed" });
});

test("the stale threshold leaves room above the route's 60s limit", () => {
  assert.ok(STALE_CLAIM_MS >= 2 * 60_000);
});

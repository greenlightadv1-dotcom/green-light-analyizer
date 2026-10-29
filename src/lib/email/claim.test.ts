import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  CONTENT_FETCH_PERMANENT_PREFIX,
  CONTENT_FETCH_RETRYABLE_PREFIX,
  claimDelivery,
  type DeliveryStore,
} from "./claim.ts";
import { normalizeInboundEmail } from "./parse.ts";
import { RFC_MESSAGE_ID, webhookPayload } from "./fixtures/resend.ts";

/**
 * §5.3 idempotency. An in-memory stand-in for inbound_emails with the same two
 * properties the intake relies on: a unique key, and a conditional UPDATE that
 * only one caller can win. (The real atomicity is Postgres's; this tests the
 * decisions made on top of it.)
 */
type Row = { status: string; detail: string };

function table() {
  const rows = new Map<string, Row>();
  const store = (key: string): DeliveryStore => ({
    async insertClaim() {
      if (rows.has(key)) {
        return { errorCode: "23505", errorMessage: "duplicate key value violates unique constraint" };
      }
      rows.set(key, { status: "failed", detail: "processing" });
      return { errorCode: null, errorMessage: null };
    },
    async reclaimAfterFetchFailure() {
      const row = rows.get(key);
      // Mirrors .eq("status","failed").like("detail", `${PREFIX}%`).
      if (!row || row.status !== "failed" || !row.detail.startsWith(CONTENT_FETCH_RETRYABLE_PREFIX)) {
        return false;
      }
      row.detail = "processing";
      return true;
    },
  });
  return { rows, store };
}

test("the first delivery is claimed", async () => {
  const { store, rows } = table();
  assert.deepEqual(await claimDelivery(store("e1")), { kind: "claimed" });
  assert.deepEqual(rows.get("e1"), { status: "failed", detail: "processing" });
});

test("a redelivery of a processed email is a duplicate", async () => {
  const { store, rows } = table();
  await claimDelivery(store("e1"));
  rows.set("e1", { status: "processed", detail: "created a deal room" });
  assert.deepEqual(await claimDelivery(store("e1")), { kind: "duplicate" });
  assert.equal(rows.get("e1")?.status, "processed", "the finished row is untouched");
});

test("a redelivery after a retryable content-fetch failure is reclaimed, once", async () => {
  const { store, rows } = table();
  await claimDelivery(store("e1"));
  rows.set("e1", { status: "failed", detail: `${CONTENT_FETCH_RETRYABLE_PREFIX} HTTP 503` });

  // Two redeliveries racing: exactly one takes the row over.
  const [a, b] = await Promise.all([claimDelivery(store("e1")), claimDelivery(store("e1"))]);
  const kinds = [a.kind, b.kind].sort();
  assert.deepEqual(kinds, ["duplicate", "reclaimed"]);
  assert.equal(rows.get("e1")?.detail, "processing");
});

test("permanent fetch failures, rejections and other failures stay duplicates", async () => {
  for (const row of [
    { status: "rejected", detail: `${CONTENT_FETCH_PERMANENT_PREFIX} HTTP 404` },
    { status: "rejected", detail: "screened out: carries mailing-list headers" },
    { status: "unknown_alias", detail: "alias matched no account" },
    // Pre-existing behaviour, deliberately unchanged by F1: a failure after
    // the content was fetched is not reclaimed, so a retry can never pay for
    // a second evaluation of a message that may already have a room.
    { status: "failed", detail: "could not create deal room: boom" },
    { status: "failed", detail: "processing" },
  ]) {
    const { store, rows } = table();
    await claimDelivery(store("e1"));
    rows.set("e1", { ...row });
    assert.deepEqual(await claimDelivery(store("e1")), { kind: "duplicate" }, row.detail);
    assert.deepEqual(rows.get("e1"), row, "row unchanged");
  }
});

test("a database error other than a unique violation is reported", async () => {
  const store: DeliveryStore = {
    insertClaim: async () => ({ errorCode: "57014", errorMessage: "canceling statement" }),
    reclaimAfterFetchFailure: async () => {
      throw new Error("must not be called");
    },
  };
  assert.deepEqual(await claimDelivery(store), { kind: "error", message: "canceling statement" });
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
  assert.deepEqual(await claimDelivery(store(first.providerMessageId!)), { kind: "claimed" });
  assert.deepEqual(await claimDelivery(store(second.providerMessageId!)), { kind: "claimed" });
});

test("a duplicate webhook delivery of the same email_id is claimed once", async () => {
  const { store } = table();
  const key = normalizeInboundEmail(webhookPayload()).providerMessageId!;
  const results = await Promise.all([1, 2, 3].map(() => claimDelivery(store(key))));
  assert.equal(results.filter((r) => r.kind === "claimed").length, 1);
  assert.equal(results.filter((r) => r.kind === "duplicate").length, 2);
});

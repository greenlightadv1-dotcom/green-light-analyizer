import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isPermanentFailure, relayIdempotencyKey, runRelay, type RelayDeps, type RelaySend } from "./relay-lifecycle.ts";

/**
 * runRelay against an in-memory model of 0036 (claim/record) and a mocked
 * provider that honours idempotency keys the way Resend documents them: the
 * same key within its window returns the first result instead of sending.
 * No real email is sent.
 */
function world(script: RelaySend[], opts: { failRecord?: boolean } = {}) {
  const state = { status: "queued" as string, attempts: 0, provider: null as string | null };
  const delivered = new Map<string, string>(); // idempotency key → provider id
  let calls = 0;
  const deps: RelayDeps = {
    async claim() {
      if (!["queued", "failed_retryable"].includes(state.status) || state.attempts >= 5) return false;
      state.status = "processing";
      return true;
    },
    async send(_id, key) {
      calls++;
      if (delivered.has(key)) return { ok: true, providerId: delivered.get(key)! };
      const r = script.shift() ?? { ok: true, providerId: `re_${calls}` };
      if (r.ok) delivered.set(key, r.providerId ?? "re_x");
      return r;
    },
    async record(_id, r) {
      if (opts.failRecord) { opts.failRecord = false; state.status = "processing"; return null; }
      state.attempts++;
      if (r.ok) { state.status = "sent"; state.provider = r.providerId; }
      else state.status = r.permanent || state.attempts >= 5 ? "failed_permanent" : "failed_retryable";
      return state.status;
    },
  };
  return { deps, state, delivered, sends: () => calls };
}

test("sent once; a second run does nothing", async () => {
  const w = world([]);
  assert.equal(await runRelay(w.deps, "m1"), "sent");
  assert.equal(await runRelay(w.deps, "m1"), "skipped");
  assert.equal(w.delivered.size, 1);
});

test("transient failure is retried, then sent", async () => {
  const w = world([{ ok: false, error: "Resend returned 503", status: 503 }]);
  assert.equal(await runRelay(w.deps, "m1"), "failed_retryable");
  assert.equal(await runRelay(w.deps, "m1"), "sent");
  assert.equal(w.state.attempts, 2);
});

test("permanent failure is not retried", async () => {
  const w = world([{ ok: false, error: "Resend returned 422: invalid to", status: 422 }]);
  assert.equal(await runRelay(w.deps, "m1"), "failed_permanent");
  assert.equal(await runRelay(w.deps, "m1"), "skipped");
  assert.equal(w.sends(), 1);
});

test("an accepted send whose outcome was not recorded is not sent twice on retry", async () => {
  const w = world([], { failRecord: true });
  assert.equal(await runRelay(w.deps, "m1"), "unrecorded");
  // The stale claim is retaken later (modelled by resetting to queued).
  w.state.status = "queued";
  assert.equal(await runRelay(w.deps, "m1"), "sent");
  assert.equal(w.delivered.size, 1, "the idempotency key returned the first send");
});

test("five transient failures become permanent", async () => {
  const fail: RelaySend = { ok: false, error: "timeout" };
  const w = world([fail, fail, fail, fail, fail]);
  const out = [];
  for (let i = 0; i < 6; i++) out.push(await runRelay(w.deps, "m1"));
  assert.deepEqual(out, ["failed_retryable", "failed_retryable", "failed_retryable", "failed_retryable", "failed_permanent", "skipped"]);
});

test("classification: client errors are permanent, rate limits, conflicts and outages are not", () => {
  for (const status of [400, 401, 403, 404, 422]) assert.equal(isPermanentFailure({ ok: false, error: "", status }), true, String(status));
  for (const status of [409, 429, 500, 502, 503]) assert.equal(isPermanentFailure({ ok: false, error: "", status }), false, String(status));
  assert.equal(isPermanentFailure({ ok: false, error: "RESEND_API_KEY is not configured" }), false, "fixed by configuration, then retried");
  assert.equal(relayIdempotencyKey("abc"), "gl-relay-abc");
});

test("the real send carries the idempotency key and never logs the message body", () => {
  const out = readFileSync(new URL("./outbound.ts", import.meta.url), "utf8");
  assert.match(out, /"idempotency-key": idempotencyKey/);
  const queue = readFileSync(new URL("./relay-queue.ts", import.meta.url), "utf8");
  assert.doesNotMatch(queue, /log\.[a-z]+\([^)]*message_text/);
  assert.match(queue, /idempotencyKey,/);
});

import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";

// Loaded through ./register.mjs (see the "test" script): the real intake.ts,
// with Supabase, the evaluator, the security check and WhatsApp replaced by
// the in-memory fakes in ./fakes.mjs. The fakes model storage, not Postgres
// concurrency — that is scripts/claim-concurrency-pg.sh.
import { processInboundEmail } from "../intake.ts";
import { normalizeInboundEmail } from "../parse.ts";
import { CONTENT_FETCH_RETRYABLE_PREFIX, STALE_CLAIM_MS, processingMarker } from "../claim.ts";
import { webhookResponseFor } from "../webhook-response.ts";
import type { ReceivedFetchResult } from "../received.ts";
import { ALIAS, EMAIL_ID, receivedEmail, webhookPayload } from "../fixtures/resend.ts";
import { SimulatedKill, reset, state } from "./fakes.mjs";

/** §5.3 intake, end to end through the real orchestration (review Findings 2–3). */

const PHONE = "01012345678";
const SENDER = "deals@brand.example";
const BODY = `Hi! We'd like a dedicated video sponsorship. Budget $1,500. Call ${PHONE}.`;

type Row = Record<string, unknown>;
const db = state.db as Record<string, Row[]>;

let logs: string[] = [];
const realConsole = { info: console.info, warn: console.warn, error: console.error };
beforeEach(() => {
  reset();
  logs = [];
  for (const level of ["info", "warn", "error"] as const) {
    console[level] = (...args: unknown[]) => void logs.push(args.map(String).join(" "));
  }
  db.profiles.push({
    id: "creator-1",
    role: "creator",
    banned_at: null,
    subscription_plan: "Starter",
    whatsapp_number: null,
    whatsapp_notifications_enabled: false,
    inbound_alias: ALIAS,
    previous_inbound_alias: null,
  });
});
process.on("exit", () => Object.assign(console, realConsole));

let fetchCalls = 0;
const content = (over: Record<string, unknown> = {}) => async (id: string): Promise<ReceivedFetchResult> => {
  fetchCalls++;
  return { ok: true, attempts: 1, email: receivedEmail({ id, html: null, text: BODY, ...over }) };
};
const failing = (retryable: boolean) => async (): Promise<ReceivedFetchResult> => {
  fetchCalls++;
  return { ok: false, retryable, reason: retryable ? "HTTP 503" : "HTTP 404", status: retryable ? 503 : 404, attempts: 1 };
};
beforeEach(() => void (fetchCalls = 0));

const meta = (over: Record<string, unknown> = {}) => normalizeInboundEmail(webhookPayload(over));
const inbound = () => db.inbound_emails.find((r) => r.provider_message_id === EMAIL_ID)!;
const offerMessages = () => db.messages.filter((m) => !String(m.message_text).startsWith("Deal Co-Pilot"));
/** Make the existing claim look as if its function died this long ago. */
const ageClaim = (ms: number) => void (inbound().detail = processingMarker(Date.now() - ms));

function assertLogsClean() {
  const all = logs.join("\n");
  for (const secret of [PHONE, "Budget", SENDER, ALIAS, "dedicated video sponsorship"]) {
    assert.ok(!all.includes(secret), `log leaked ${JSON.stringify(secret)}:\n${all}`);
  }
}
const events = () => logs.map((l) => JSON.parse(l).event as string);

test("a delivery is fetched, masked, stored and marked processed", async () => {
  const deadlineAt = Date.now() + 52_000;
  const outcome = await processInboundEmail(meta(), { fetchContent: content(), deadlineAt });

  assert.equal(outcome.status, "processed");
  assert.equal(webhookResponseFor(outcome.status).httpStatus, 200);
  assert.equal(db.deal_chats.length, 1);
  assert.equal(db.deal_chats[0].offered_amount, 1500);
  assert.equal(offerMessages().length, 1);
  assert.ok(!String(offerMessages()[0].message_text).includes(PHONE), "masked before storage");
  assert.equal(db.violation_logs.length, 1);
  assert.equal(inbound().status, "processed");
  assert.equal(inbound().chat_id, db.deal_chats[0].id);
  assert.ok(!JSON.stringify(inbound()).includes("Budget"), "no body in the audit row");
  assert.equal(state.evaluations[0].options?.deadlineAt, deadlineAt, "the evaluator gets the request deadline");
  assertLogsClean();
});

test("a normal duplicate delivery is acknowledged without any work", async () => {
  await processInboundEmail(meta(), { fetchContent: content() });
  const outcome = await processInboundEmail(meta(), { fetchContent: content() });
  assert.equal(outcome.detail, "duplicate delivery ignored");
  assert.equal(webhookResponseFor(outcome.status).httpStatus, 200);
  assert.equal(fetchCalls, 1);
  assert.equal(db.deal_chats.length, 1);
  assert.equal(state.evaluations.length, 1);
});

test("a retryable fetch failure answers 500, and the redelivery reclaims and finishes", async () => {
  const first = await processInboundEmail(meta(), { fetchContent: failing(true) });
  assert.equal(first.status, "failed");
  assert.equal(webhookResponseFor(first.status).httpStatus, 500);
  assert.ok(String(inbound().detail).startsWith(CONTENT_FETCH_RETRYABLE_PREFIX));

  const second = await processInboundEmail(meta(), { fetchContent: content() });
  assert.equal(second.status, "processed");
  assert.equal(db.deal_chats.length, 1);
  assert.ok(events().includes("inbound.claim_reclaimed"));
  assertLogsClean();
});

test("a permanent fetch failure is a 200 rejection, logged at error level", async () => {
  const outcome = await processInboundEmail(meta(), { fetchContent: failing(false) });
  assert.equal(outcome.status, "rejected");
  assert.equal(webhookResponseFor(outcome.status).httpStatus, 200);
  const line = logs.map((l) => JSON.parse(l)).find((l) => l.event === "inbound.content_fetch_failed");
  assert.equal(line.level, "error");
  assert.equal(line.retryable, false);
  assertLogsClean();
});

test("a live processing claim is not touched: 503, nothing fetched or written", async () => {
  // Another execution claimed it a moment ago and is still working.
  db.inbound_emails.push({ id: "x", provider_message_id: EMAIL_ID, status: "failed", detail: processingMarker(Date.now() - 5_000), chat_id: null });

  const outcome = await processInboundEmail(meta(), { fetchContent: content() });
  assert.equal(outcome.status, "in_progress");
  assert.equal(webhookResponseFor(outcome.status).httpStatus, 503);
  assert.equal(fetchCalls, 0);
  assert.equal(db.deal_chats.length, 0);
  assert.equal(inbound().status, "failed", "in_progress is never written to the row");
  assert.ok(events().includes("inbound.claim_in_progress"));
  assertLogsClean();
});

test("a stale processing claim with no progress is recovered into a fresh room", async () => {
  db.inbound_emails.push({ id: "x", provider_message_id: EMAIL_ID, status: "failed", detail: processingMarker(Date.now() - STALE_CLAIM_MS - 1_000), chat_id: null });

  const outcome = await processInboundEmail(meta(), { fetchContent: content() });
  assert.equal(outcome.status, "processed");
  assert.equal(db.deal_chats.length, 1);
  assert.equal(offerMessages().length, 1);
  const reclaimed = logs.map((l) => JSON.parse(l)).find((l) => l.event === "inbound.claim_reclaimed");
  assert.equal(reclaimed.reason, "stale_claim");
  assert.equal(reclaimed.had_room, false);
  assertLogsClean();
});

test("two concurrent redeliveries of one stale claim: exactly one processes", async () => {
  db.inbound_emails.push({ id: "x", provider_message_id: EMAIL_ID, status: "failed", detail: processingMarker(Date.now() - 10 * 60_000), chat_id: null });

  const outcomes = await Promise.all([
    processInboundEmail(meta(), { fetchContent: content() }),
    processInboundEmail(meta(), { fetchContent: content() }),
  ]);
  assert.deepEqual(outcomes.map((o) => o.status).sort(), ["in_progress", "processed"]);
  assert.equal(fetchCalls, 1);
  assert.equal(db.deal_chats.length, 1);
  assert.equal(state.evaluations.length, 1, "one paid evaluation");
});

test("killed after the room was created: recovery reuses the room, no second evaluation or alert", async () => {
  // Dies writing the opening summary — after the room and its checkpoint.
  state.killWhen = (table: string, op: string, row: Row | undefined) =>
    table === "messages" && op === "insert" && String(row?.message_text).startsWith("Deal Co-Pilot");
  await assert.rejects(processInboundEmail(meta(), { fetchContent: content() }), SimulatedKill);
  assert.equal(db.deal_chats.length, 1);
  assert.equal(inbound().chat_id, db.deal_chats[0].id, "checkpoint recorded the room");
  assert.ok(String(inbound().detail).startsWith("processing since "), "left looking live");

  // The provider's next attempt, inside the window: told to come back.
  state.killWhen = null;
  assert.equal((await processInboundEmail(meta(), { fetchContent: content() })).status, "in_progress");

  // A later attempt, after the function must have died.
  ageClaim(STALE_CLAIM_MS + 1_000);
  const recovered = await processInboundEmail(meta(), { fetchContent: content() });
  assert.equal(recovered.status, "processed");
  assert.equal(recovered.detail, "recovered an interrupted delivery into its deal room");
  assert.equal(db.deal_chats.length, 1, "no duplicate room");
  assert.equal(offerMessages().length, 1, "offer stored once");
  assert.equal(state.evaluations.length, 1, "not evaluated twice");
  assert.equal(state.notifications, 1, "not alerted twice");
  assertLogsClean();
});

test("killed after the offer was stored: recovery does not store it again", async () => {
  // Dies writing the violation log — after the offer message.
  state.killWhen = (table: string) => table === "violation_logs";
  await assert.rejects(processInboundEmail(meta(), { fetchContent: content() }), SimulatedKill);
  assert.equal(offerMessages().length, 1);
  assert.equal(db.violation_logs.length, 0);

  state.killWhen = null;
  ageClaim(STALE_CLAIM_MS + 1_000);
  const recovered = await processInboundEmail(meta(), { fetchContent: content() });
  assert.equal(recovered.status, "processed");
  assert.equal(offerMessages().length, 1, "the earlier write is recognised, not repeated");
  assert.equal(db.violation_logs.length, 1, "the missing violation log is written");
  assert.equal(db.violation_logs[0].message_id, offerMessages()[0].id);
});

test("killed after everything but the final status: recovery adds nothing", async () => {
  // Dies on the last write, the one that marks the row processed.
  state.killWhen = (table: string, op: string, row: Row | undefined) =>
    table === "inbound_emails" && op === "update" && row?.status === "processed";
  await assert.rejects(processInboundEmail(meta(), { fetchContent: content() }), SimulatedKill);

  state.killWhen = null;
  ageClaim(STALE_CLAIM_MS + 1_000);
  await processInboundEmail(meta(), { fetchContent: content() });
  assert.equal(db.deal_chats.length, 1);
  assert.equal(offerMessages().length, 1);
  assert.equal(db.violation_logs.length, 1);
  assert.equal(inbound().status, "processed");
});

test("residual race: killed between creating the room and recording it", async () => {
  // The one window the checkpoint cannot close: the room exists, the claim
  // row does not know about it. Recovery then falls back to the open-thread
  // lookup (same creator, same sender, not paid), which finds that room —
  // so no duplicate room here. A duplicate *is* possible if the room was
  // marked paid before recovery ran; that, and a missing opening summary, is
  // the documented residual (CLAUDE.md §5).
  state.killWhen = (table: string, op: string, row: Row | undefined) =>
    table === "inbound_emails" && op === "update" && row !== undefined && "chat_id" in row && !("status" in row);
  await assert.rejects(processInboundEmail(meta(), { fetchContent: content() }), SimulatedKill);
  assert.equal(db.deal_chats.length, 1);
  assert.equal(inbound().chat_id ?? null, null);

  state.killWhen = null;
  ageClaim(STALE_CLAIM_MS + 1_000);
  const recovered = await processInboundEmail(meta(), { fetchContent: content() });
  assert.equal(recovered.status, "processed");
  assert.equal(db.deal_chats.length, 1, "threading found the orphaned room");
  assert.equal(offerMessages().length, 1);
  assert.equal(state.evaluations.length, 1);
});

test("unknown aliases and missing email ids cost no fetch", async () => {
  const unknown = await processInboundEmail(meta({ received_for: ["nobody.zzzz@analyze.greenlightadvs.com"] }), { fetchContent: content() });
  assert.equal(unknown.status, "unknown_alias");
  const noId = await processInboundEmail(normalizeInboundEmail({ type: "email.received", data: { from: SENDER, received_for: [ALIAS] } }), { fetchContent: content() });
  assert.equal(noId.status, "rejected");
  assert.equal(fetchCalls, 0);
});

test("the recorded room wins even when the thread lookup can no longer find it", async () => {
  // Same crash point as above, but by the time recovery runs the room has
  // been moved to 'paid', which the open-thread lookup excludes. Only the
  // checkpointed chat_id keeps recovery from opening a second room.
  state.killWhen = (table: string, op: string, row: Row | undefined) =>
    table === "messages" && op === "insert" && String(row?.message_text).startsWith("Deal Co-Pilot");
  await assert.rejects(processInboundEmail(meta(), { fetchContent: content() }), SimulatedKill);
  db.deal_chats[0].deal_status = "paid";

  state.killWhen = null;
  ageClaim(STALE_CLAIM_MS + 1_000);
  await processInboundEmail(meta(), { fetchContent: content() });
  assert.equal(db.deal_chats.length, 1, "no second room");
  assert.equal(offerMessages()[0].chat_id, db.deal_chats[0].id);
});

// --- D4: Gmail forwarding confirmation ----------------------------------------

const GMAIL_SUBJECT = "(#123456789) Gmail Forwarding Confirmation - Receive Mail from creator@mail.example";
const GMAIL_BODY =
  "creator@mail.example has requested to automatically forward mail to your email address.\n" +
  "Confirmation code: 123456789\n" +
  "To allow creator@mail.example to automatically forward mail to your address, please click the link below to confirm the request:\n" +
  "https://mail-settings.google.com/mail/vf-%5Bexample%5D";

test("a Gmail forwarding confirmation opens no room, runs no evaluation and sends no alert", async () => {
  const realFetch = globalThis.fetch;
  let outboundFetches = 0;
  globalThis.fetch = (async () => {
    outboundFetches++;
    throw new Error("no outbound request may be made — the link is never visited");
  }) as typeof fetch;
  try {
    const gmail = { from: "Gmail Team <forwarding-noreply@google.com>", subject: GMAIL_SUBJECT };
    const outcome = await processInboundEmail(meta(gmail), {
      fetchContent: content({ ...gmail, text: GMAIL_BODY, headers: {} }),
    });
    assert.equal(outcome.status, "rejected");
    assert.equal(webhookResponseFor(outcome.status).httpStatus, 200, "acknowledged, not retried");
    assert.equal(db.deal_chats.length, 0);
    assert.equal(db.messages.length, 0);
    assert.equal(state.evaluations.length, 0);
    assert.equal(state.notifications, 0);
    assert.equal(outboundFetches, 0);
    assert.equal(inbound().status, "rejected");
    assert.equal(inbound().detail, "gmail forwarding confirmation");
    assert.equal(inbound().creator_id, "creator-1");
    assert.equal(inbound().subject, GMAIL_SUBJECT, "kept so the held panel can show the code");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a 'confirmation' that failed DKIM is not trusted and goes through the normal screen", async () => {
  const forged = { from: "forwarding-noreply@google.com", subject: GMAIL_SUBJECT };
  await processInboundEmail(meta(forged), {
    fetchContent: content({ ...forged, text: GMAIL_BODY, authentication: { spf: "pass", dkim: "fail", dmarc: "fail" } }),
  });
  assert.notEqual(inbound().detail, "gmail forwarding confirmation");
});

test("a real offer from another sender with a look-alike subject is still a deal", async () => {
  const lookalike = { subject: "(#123456789) Gmail Forwarding Confirmation" };
  const outcome = await processInboundEmail(meta(lookalike), { fetchContent: content(lookalike) });
  assert.equal(outcome.status, "processed");
  assert.equal(db.deal_chats.length, 1);
});

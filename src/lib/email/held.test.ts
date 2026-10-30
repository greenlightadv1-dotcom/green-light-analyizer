import test from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_BODY_DETAIL,
  classifyHeldReason,
  isShownToCreator,
  toHeldDeliveries,
  toHeldDelivery,
  type HeldRow,
} from "./held.ts";

const row = (overrides: Partial<HeldRow> = {}): HeldRow => ({
  id: "00000000-0000-4000-8000-000000000001",
  created_at: "2026-10-01T10:00:00.000Z",
  sender_email: "news@brand.example",
  subject: "Your weekly digest",
  detail: "screened out: carries mailing-list headers (List-Unsubscribe / List-ID)",
  spam_score: 15,
  spam_reasons: ["carries mailing-list headers (List-Unsubscribe / List-ID)"],
  ...overrides,
});

// ---- the security properties ------------------------------------------------

test("the projection carries exactly the public fields — no internal column leaks", () => {
  // The whole reason this is a projection instead of an RLS policy: a policy
  // would expose every column. This pins the set that may leave the server.
  const projected = toHeldDelivery(row());
  assert.deepEqual(Object.keys(projected).sort(), [
    "confirmationCode",
    "id",
    "reason",
    "receivedAt",
    "sender",
    "subject",
    "subjectRedacted",
  ]);
});

test("the operator's detail, score and raw rule strings never reach the creator", () => {
  const serialized = JSON.stringify(toHeldDelivery(row()));
  assert.doesNotMatch(serialized, /screened out/);
  assert.doesNotMatch(serialized, /List-Unsubscribe/);
  assert.doesNotMatch(serialized, /"15"|:15[,}]/);
});

test("a phone number in the subject is masked, including the Egyptian mobile format", () => {
  for (const phone of ["01012345678", "+20 101 234 5678", "(555) 123-4567"]) {
    const held = toHeldDelivery(row({ subject: `Deal inside — call ${phone}` }));
    assert.ok(held.subjectRedacted, `not flagged for ${phone}`);
    assert.doesNotMatch(held.subject, /\d{3}.?\d{4}/, `leaked ${phone}: ${held.subject}`);
  }
});

test("an email address in the subject is masked", () => {
  const held = toHeldDelivery(row({ subject: "Reply to ceo@brand.example directly" }));
  assert.ok(held.subjectRedacted);
  assert.doesNotMatch(held.subject, /ceo@brand\.example/);
});

test("a WhatsApp or Telegram link in the subject is masked", () => {
  for (const link of ["wa.me/201012345678", "t.me/brandteam", "whatsapp/brandteam"]) {
    const held = toHeldDelivery(row({ subject: `Collab? ${link}` }));
    assert.ok(held.subjectRedacted, `not flagged for ${link}`);
    assert.ok(!held.subject.includes(link), `leaked ${link}`);
  }
});

test("no raw contact detail survives anywhere in the serialized list", () => {
  // End to end over the list, not one field at a time, so a new field added
  // to the projection cannot quietly carry an unmasked value out.
  const raw = "Sponsorship! WhatsApp wa.me/201012345678 or mail deals@brand.example";
  const serialized = JSON.stringify(toHeldDeliveries([row({ subject: raw })]));
  assert.ok(!serialized.includes("201012345678"));
  assert.ok(!serialized.includes("deals@brand.example"));
});

test("a clean subject passes through unchanged and unflagged", () => {
  const held = toHeldDelivery(row({ subject: "  Q4 partnership brief  " }));
  assert.equal(held.subject, "Q4 partnership brief");
  assert.equal(held.subjectRedacted, false);
});

test("a missing subject is an empty string, never null or a placeholder", () => {
  assert.equal(toHeldDelivery(row({ subject: null })).subject, "");
});

// ---- the allowlist ----------------------------------------------------------

test("a screener refusal is shown — identified by its score, not by prose", () => {
  assert.ok(isShownToCreator(row()));
  assert.ok(isShownToCreator(row({ detail: "anything the wording becomes later" })));
});

test("a score of 0 — the most-spammy result — is still shown", () => {
  // Pins `spam_score !== null`. A truthy check would read cleaner and would
  // silently hide exactly the deliveries the screener was most sure about.
  assert.ok(isShownToCreator(row({ spam_score: 0 })));
});

test("an empty delivery is shown", () => {
  assert.ok(isShownToCreator(row({ spam_score: null, spam_reasons: null, detail: EMPTY_BODY_DETAIL })));
});

test("a suspended account's rejection is not shown", () => {
  assert.ok(!isShownToCreator(row({ spam_score: null, spam_reasons: null, detail: "account is suspended" })));
});

test("an unrecognised rejection reason stays admin-only by default", () => {
  // Allowlist, not denylist: a reason added to intake later must not surface
  // to creators with a message nobody wrote for them.
  assert.ok(!isShownToCreator(row({ spam_score: null, spam_reasons: null, detail: "some future reason" })));
});

test("toHeldDeliveries filters before projecting and keeps newest-first order", () => {
  const list = toHeldDeliveries([
    row({ id: "a" }),
    row({ id: "b", spam_score: null, detail: "account is suspended" }),
    row({ id: "c", spam_score: null, spam_reasons: null, detail: EMPTY_BODY_DETAIL }),
  ]);
  assert.deepEqual(list.map((d) => d.id), ["a", "c"]);
});

// ---- reason categories ------------------------------------------------------

test("mailing-list and auto-responder headers read as bulk mail", () => {
  for (const reason of [
    "carries mailing-list headers (List-Unsubscribe / List-ID)",
    "sender marked it Precedence: bulk",
    "sender marked it Auto-Submitted: auto-replied",
    "is an auto-responder",
  ]) {
    assert.equal(classifyHeldReason(row({ spam_reasons: [reason] })), "bulk", reason);
  }
});

test("a no-reply sender reads as no-reply, even alongside bulk signals", () => {
  // The more specific, more actionable reason wins: "you can't reply to this
  // address" is what the creator needs to know.
  assert.equal(
    classifyHeldReason(
      row({ spam_reasons: ["carries mailing-list headers", "sent from an address that cannot receive replies"] }),
    ),
    "noReply",
  );
});

test("an empty delivery reads as empty", () => {
  assert.equal(classifyHeldReason(row({ spam_score: null, detail: EMPTY_BODY_DETAIL })), "empty");
});

test("anything else the screener refused reads as a generic screen", () => {
  assert.equal(classifyHeldReason(row({ spam_reasons: ["almost no readable body"] })), "screened");
  assert.equal(classifyHeldReason(row({ spam_reasons: null })), "screened");
});

// --- D4: Gmail forwarding confirmation -----------------------------------------

test("a Gmail forwarding confirmation is shown to the creator with its code only", () => {
  const confirmation = row({
    sender_email: "forwarding-noreply@google.com",
    subject: "(#123456789) Gmail Forwarding Confirmation - Receive Mail from creator@mail.example",
    detail: "gmail forwarding confirmation",
    spam_score: null,
    spam_reasons: null,
  });
  assert.equal(isShownToCreator(confirmation), true);
  const held = toHeldDelivery(confirmation);
  assert.equal(held.reason, "forwardingConfirmation");
  assert.equal(held.confirmationCode, "123456789");
  assert.ok(!held.subject.includes("creator@mail.example"), "the subject is still masked");
});

test("no confirmation code is surfaced for any other held delivery", () => {
  assert.equal(toHeldDelivery(row({ subject: "(#123456789) looks like a code" })).confirmationCode, null);
  const wrongSender = row({
    sender_email: "attacker@evil.example",
    subject: "(#123456789) Gmail Forwarding Confirmation",
    detail: "gmail forwarding confirmation",
    spam_score: null,
  });
  assert.equal(toHeldDelivery(wrongSender).confirmationCode, null);
});

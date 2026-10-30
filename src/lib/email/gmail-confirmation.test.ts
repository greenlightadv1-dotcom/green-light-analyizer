import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  confirmationCodeFromSubject,
  isGmailForwardingConfirmation,
} from "./gmail-confirmation.ts";

/** D4: Gmail's forwarding confirmation is setup mail, never a sponsorship offer. */

const SUBJECT = "(#123456789) Gmail Forwarding Confirmation - Receive Mail from creator@mail.example";
const FROM = "forwarding-noreply@google.com";

test("recognises the genuine confirmation", () => {
  assert.ok(isGmailForwardingConfirmation({ from: FROM, subject: SUBJECT }));
  assert.ok(isGmailForwardingConfirmation({ from: " Forwarding-NoReply@Google.com ", subject: SUBJECT }));
  // Localised subjects keep the (#code) prefix.
  assert.ok(isGmailForwardingConfirmation({ from: FROM, subject: "(#987654321) تأكيد إعادة توجيه Gmail" }));
  assert.ok(
    isGmailForwardingConfirmation({
      from: FROM,
      subject: SUBJECT,
      headers: { "authentication-results": "mx.example; dkim=pass header.d=google.com; dmarc=pass" },
      authentication: { spf: "pass", dkim: "pass", dmarc: "pass" },
    }),
  );
});

test("any other sender is not a confirmation, whatever the subject", () => {
  for (const from of [
    "noreply@google.com",
    "forwarding-noreply@google.com.evil.example",
    "forwarding-noreply@googIe.com",
    "deals@brand.example",
    null,
  ]) {
    assert.equal(isGmailForwardingConfirmation({ from, subject: SUBJECT }), false, String(from));
  }
});

test("the subject must start with the (#code) prefix", () => {
  for (const subject of [
    "Gmail Forwarding Confirmation",
    "Re: (#123456789) Gmail Forwarding Confirmation",
    "(#12345) too short",
    "(#1234567890123) too long",
    "(#abc123456) not digits",
    "",
    null,
    undefined,
  ]) {
    assert.equal(isGmailForwardingConfirmation({ from: FROM, subject }), false, String(subject));
  }
});

test("a DKIM or DMARC failure means it is not from Google", () => {
  for (const headers of [
    { "authentication-results": "mx.example; dkim=fail; dmarc=pass" },
    { "authentication-results": "mx.example; dkim=pass; dmarc=fail" },
    { "authentication-results": "mx.example; dmarc=permerror" },
  ]) {
    assert.equal(isGmailForwardingConfirmation({ from: FROM, subject: SUBJECT, headers }), false);
  }
  for (const authentication of [{ dkim: "fail" }, { dmarc: "FAIL" }, { dkim: "softfail" }]) {
    assert.equal(isGmailForwardingConfirmation({ from: FROM, subject: SUBJECT, authentication }), false);
  }
  // SPF alone is not decisive.
  assert.ok(isGmailForwardingConfirmation({ from: FROM, subject: SUBJECT, authentication: { spf: "fail" } }));
});

test("only the digits are extracted — never a link or other text", () => {
  assert.equal(confirmationCodeFromSubject(SUBJECT), "123456789");
  assert.equal(confirmationCodeFromSubject("  (#555666777) x https://evil.example"), "555666777");
  assert.equal(confirmationCodeFromSubject("https://evil.example (#555666777)"), null);
  assert.equal(confirmationCodeFromSubject(null), null);
});

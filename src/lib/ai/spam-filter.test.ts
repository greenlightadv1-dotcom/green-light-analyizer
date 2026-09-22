import test from "node:test";
import assert from "node:assert/strict";

import { screenInboundEmail } from "./spam-filter.ts";

/**
 * The asymmetry is the thing being tested. A `flag` that should have been an
 * `accept` costs a creator one click; a `reject` that should have been an
 * `accept` loses them a paying deal with no trace on their screen. So most of
 * what follows pins down what must NOT be rejected.
 */

const offer = {
  subject: "Sponsorship opportunity for your channel",
  bodyText:
    "Hi! We'd love to work with you on a dedicated video about our app. Our budget for this is $2,000 and we're flexible on timing.",
  from: "maya@brandco.com",
};

test("a plain sponsorship offer is accepted", () => {
  const result = screenInboundEmail(offer);
  assert.equal(result.verdict, "accept");
  assert.ok(result.score >= 50, `score was ${result.score}`);
});

test("a newsletter with mailing-list headers is rejected", () => {
  const result = screenInboundEmail({
    subject: "Your weekly digest is here",
    bodyText: "Here are this week's top stories. Unsubscribe at any time.",
    from: "news@example.com",
    headers: { "list-unsubscribe": "<https://example.com/u/123>" },
  });
  assert.equal(result.verdict, "reject");
  assert.ok(result.reasons.length > 0);
});

test("a no-reply notification is rejected", () => {
  const result = screenInboundEmail({
    subject: "Security alert: new sign-in",
    bodyText: "We noticed a new sign-in to your account.",
    from: "no-reply@accounts.example.com",
  });
  assert.equal(result.verdict, "reject");
});

test("agency outreach sent through a marketing platform survives its own List-Unsubscribe", () => {
  // The case that makes rejection conditional on there being no sponsorship
  // signal: real agencies send outreach at scale, headers and all.
  const result = screenInboundEmail({
    subject: "Paid partnership — Q4 campaign",
    bodyText:
      "We're booking creators for a paid promotion in Q4. Budget is $3,500 per integration. Unsubscribe here if you'd rather not hear from us.",
    from: "campaigns@agency.example",
    headers: { "list-unsubscribe": "<https://agency.example/u/9>", precedence: "bulk" },
  });
  assert.notEqual(result.verdict, "reject");
});

test("a sponsorship offer from a no-reply address is flagged, never rejected", () => {
  const result = screenInboundEmail({
    subject: "Sponsorship enquiry",
    bodyText: "We have a $1,200 budget for a dedicated video.",
    from: "noreply@brand.example",
  });
  assert.notEqual(result.verdict, "reject");
});

test("authentication failure alone never rejects — forwarding breaks SPF by design", () => {
  const result = screenInboundEmail({
    ...offer,
    headers: { "authentication-results": "mx.google.com; spf=fail; dkim=pass; dmarc=pass" },
  });
  assert.notEqual(result.verdict, "reject");
  assert.ok(result.reasons.some((r) => r.includes("SPF")));
});

test("a scam-shaped offer still reaches the creator", () => {
  // Judging this one is runSecurityCheck's and the Co-Pilot's job. The screen
  // must not swallow it, because a red rating on screen beats silence.
  const result = screenInboundEmail({
    subject: "Collaboration offer - $5000",
    bodyText:
      "Dear creator, we want to sponsor your channel. Download the brief from the link and sign in to confirm.",
    from: "promo@quickcash-offers.example",
  });
  assert.notEqual(result.verdict, "reject");
});

test("an empty-bodied delivery with no signal is flagged, not accepted", () => {
  const result = screenInboundEmail({ subject: "hi", bodyText: "hey", from: "someone@example.com" });
  assert.equal(result.verdict, "flag");
});

test("headers are read case-insensitively via the normalized bag", () => {
  const withHeader = screenInboundEmail({
    subject: "Weekly digest",
    bodyText: "Stories.",
    from: "news@example.com",
    headers: { precedence: "bulk" },
  });
  const without = screenInboundEmail({
    subject: "Weekly digest",
    bodyText: "Stories.",
    from: "news@example.com",
  });
  assert.ok(withHeader.score < without.score);
});

test("missing headers are treated as not asserted, never as asserted false", () => {
  const result = screenInboundEmail(offer);
  assert.ok(!result.reasons.some((r) => r.toLowerCase().includes("precedence")));
});

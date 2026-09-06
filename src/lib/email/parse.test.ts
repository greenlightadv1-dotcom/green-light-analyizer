import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  buildOfferText,
  collectAddresses,
  displayName,
  extractOfferedAmount,
  findInboundAlias,
  htmlToText,
  inferSponsorshipType,
  normalizeAddress,
  normalizeInboundEmail,
  stripQuotedReply,
  summarizeAttachments,
} from "./parse.ts";

/** §5 inbound email parsing. */

// --- addresses -------------------------------------------------------------

test("extracts the address out of a display-name form", () => {
  assert.equal(normalizeAddress("Brand Team <deals@brand.com>"), "deals@brand.com");
  assert.equal(normalizeAddress("deals@brand.com"), "deals@brand.com");
  assert.equal(normalizeAddress("  DEALS@Brand.COM "), "deals@brand.com");
});

test("rejects anything that is not an address", () => {
  for (const bad of ["", "not an address", "a@b", null, undefined, 42]) {
    assert.equal(normalizeAddress(bad), null, `${String(bad)} should not parse`);
  }
});

test("reads the display name when there is one", () => {
  assert.equal(displayName("Brand Team <deals@brand.com>"), "Brand Team");
  assert.equal(displayName('"Brand, Inc." <deals@brand.com>'), "Brand, Inc.");
  assert.equal(displayName("deals@brand.com"), null);
});

test("collects recipients from every shape a provider might send", () => {
  const expected = ["a@x.com", "b@y.com"];
  assert.deepEqual(collectAddresses("a@x.com, b@y.com"), expected);
  assert.deepEqual(collectAddresses(["a@x.com", "b@y.com"]), expected);
  assert.deepEqual(
    collectAddresses([{ address: "a@x.com" }, { email: "b@y.com" }]),
    expected,
  );
  assert.deepEqual(collectAddresses(["Team <a@x.com>", "b@y.com"]), expected);
  assert.deepEqual(collectAddresses(undefined), []);
});

test("§5.1: finds our alias among a forwarded message's recipients", () => {
  const recipients = [
    "creator@gmail.com",
    "someone.else@other.com",
    "amir.k3f9x2@analyze.greenlight.com",
  ];
  assert.equal(
    findInboundAlias(recipients, "analyze.greenlight.com"),
    "amir.k3f9x2@analyze.greenlight.com",
  );
});

test("returns null when no recipient is one of ours", () => {
  assert.equal(findInboundAlias(["a@x.com"], "analyze.greenlight.com"), null);
  // Must not be fooled by the domain appearing as a subdomain of something else.
  assert.equal(
    findInboundAlias(["a@analyze.greenlight.com.evil.net"], "analyze.greenlight.com"),
    null,
  );
});

// --- content ---------------------------------------------------------------

test("converts HTML bodies to readable text", () => {
  const html = "<p>Hi there</p><p>We&#39;d love a <b>dedicated video</b>.</p>";
  const text = htmlToText(html);
  assert.match(text, /Hi there/);
  assert.match(text, /dedicated video/);
  assert.ok(!text.includes("<"), "tags should be gone");
  assert.match(text, /We'd/, "entities should be decoded");
});

test("drops script and style content rather than inlining it", () => {
  const text = htmlToText("<style>.a{color:red}</style><p>Offer</p>");
  assert.ok(!text.includes("color:red"));
  assert.match(text, /Offer/);
});

test("strips quoted history from a reply", () => {
  const body = [
    "Can you do 800 instead?",
    "",
    "On Mon, 5 May 2025 at 10:00, Creator wrote:",
    "> my rate is 1200",
  ].join("\n");
  const stripped = stripQuotedReply(body);
  assert.match(stripped, /800 instead/);
  assert.ok(!stripped.includes("my rate is 1200"));
});

test("keeps the whole body when stripping would leave nothing useful", () => {
  const body = "Hi\n\nOn Mon, someone wrote:\n> a long quoted thing";
  assert.ok(stripQuotedReply(body).length > 5);
});

// --- offered amount --------------------------------------------------------

test("reads the offered amount in the formats sponsors write", () => {
  assert.equal(extractOfferedAmount("We can pay $500 for this"), 500);
  assert.equal(extractOfferedAmount("budget is USD 1,200"), 1200);
  assert.equal(extractOfferedAmount("we offer 750 USD"), 750);
  assert.equal(extractOfferedAmount("about 2000 dollars"), 2000);
  assert.equal(extractOfferedAmount("$1.5k budget"), 1500);
});

test("takes the largest plausible figure when several appear", () => {
  assert.equal(extractOfferedAmount("$200 upfront and $800 on delivery"), 800);
});

test("returns null rather than guessing when no amount is stated", () => {
  // A wrong number here anchors the creator's entire negotiation.
  assert.equal(extractOfferedAmount("Let us know your rates!"), null);
  assert.equal(extractOfferedAmount(""), null);
});

test("ignores figures too large to be a fee", () => {
  assert.equal(extractOfferedAmount("your 5,000,000 USD audience"), null);
});

// --- sponsorship type ------------------------------------------------------

test("§6.2: infers the deliverable, specific before generic", () => {
  assert.equal(inferSponsorshipType("a dedicated video review"), "video_dedicated");
  assert.equal(inferSponsorshipType("60-second integration mid-roll"), "integration");
  assert.equal(inferSponsorshipType("an instagram story share"), "story_share");
  assert.equal(inferSponsorshipType("a live shout-out on stream"), "live_mention");
  assert.equal(inferSponsorshipType("one feed post"), "post");
});

test("falls back to other rather than mislabelling", () => {
  assert.equal(inferSponsorshipType("we would like to work together"), "other");
});

// --- envelope --------------------------------------------------------------

test("normalizes a wrapped provider payload", () => {
  const email = normalizeInboundEmail({
    type: "email.received",
    data: {
      message_id: "msg_123",
      from: "Brand Team <deals@brand.com>",
      to: ["amir.k3f9x2@analyze.greenlight.com"],
      subject: "Sponsorship opportunity",
      text: "We can pay $500 for a dedicated video.",
      attachments: [
        { filename: "rate-card.txt", content_type: "text/plain", content: "tier 1: 500", size: 11 },
        { filename: "brief.pdf", content_type: "application/pdf", size: 90210 },
      ],
    },
  });

  assert.equal(email.providerMessageId, "msg_123");
  assert.equal(email.from, "deals@brand.com");
  assert.equal(email.fromName, "Brand Team");
  assert.deepEqual(email.to, ["amir.k3f9x2@analyze.greenlight.com"]);
  assert.equal(email.attachments.length, 2);
});

test("normalizes an unwrapped payload too", () => {
  const email = normalizeInboundEmail({
    id: "msg_456",
    from: "deals@brand.com",
    to: "amir.k3f9x2@analyze.greenlight.com",
    subject: "Hi",
    html: "<p>Offer inside</p>",
  });
  assert.equal(email.providerMessageId, "msg_456");
  assert.match(email.text, /Offer inside/);
});

test("survives a payload that is missing everything", () => {
  const email = normalizeInboundEmail({});
  assert.equal(email.from, null);
  assert.equal(email.providerMessageId, null);
  assert.deepEqual(email.to, []);
  assert.equal(email.text, "");
  assert.deepEqual(email.attachments, []);
});

test("reads text attachments into the offer, catalogues binary ones", () => {
  const email = normalizeInboundEmail({
    data: {
      id: "m1",
      from: "deals@brand.com",
      to: ["a@analyze.greenlight.com"],
      subject: "Rates",
      text: "See attached.",
      attachments: [
        { filename: "rates.txt", content_type: "text/plain", content: "dedicated video: $900" },
        { filename: "logo.png", content_type: "image/png", size: 4096 },
      ],
    },
  });

  const offer = buildOfferText(email);
  assert.match(offer, /See attached/);
  assert.match(offer, /dedicated video: \$900/, "text attachment should be readable");
  assert.ok(!offer.includes("logo.png"), "binary content is not inlined");

  // ...and the amount inside the attachment is what gets picked up.
  assert.equal(extractOfferedAmount(offer), 900);

  const summary = summarizeAttachments(email.attachments);
  assert.match(summary, /rates\.txt/);
  assert.match(summary, /logo\.png/);
});

test("buildOfferText is bounded", () => {
  const email = normalizeInboundEmail({
    data: { id: "m", from: "a@b.com", to: [], subject: "x", text: "y".repeat(50_000) },
  });
  assert.ok(buildOfferText(email).length <= 20_000);
});

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  buildOfferText,
  collectAddresses,
  displayName,
  extractOfferedAmount,
  parseAmountToken,
  findInboundAlias,
  htmlToText,
  inferSponsorshipType,
  normalizeAddress,
  normalizeHeaders,
  MAX_HTML_INPUT_CHARS,
  MAX_OFFER_TEXT,
  MAX_TEXT_INPUT_CHARS,
  TRUNCATION_NOTICE,
  mergeReceivedEmail,
  normalizeInboundEmail,
  stripQuotedReply,
  summarizeAttachments,
} from "./parse.ts";
import { ALIAS, EMAIL_ID, RFC_MESSAGE_ID, receivedEmail, webhookPayload } from "./fixtures/resend.ts";

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
      email_id: "msg_123",
      message_id: "<rfc-123@brand.com>",
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

test("decodes a base64 text attachment, and leaves a plain one alone", () => {
  const email = normalizeInboundEmail({
    from: "deals@brand.com",
    to: ["amir.k3f9x2@analyze.greenlight.com"],
    subject: "Rate card",
    text: "See attached.",
    attachments: [
      {
        filename: "rate-card.txt",
        content_type: "text/plain",
        encoding: "base64",
        // "Dedicated video: $1,400 — مرحبا" — non-ASCII on purpose: atob()
        // would corrupt this, Buffer does not.
        content: Buffer.from("Dedicated video: $1,400 — مرحبا", "utf8").toString("base64"),
      },
      {
        filename: "note.txt",
        content_type: "text/plain",
        content: "Plain text, no encoding field.",
      },
    ],
  });

  assert.equal(email.attachments[0].text, "Dedicated video: $1,400 — مرحبا");
  assert.equal(email.attachments[1].text, "Plain text, no encoding field.");

  // And the decoded figure is what reaches the evaluator.
  assert.equal(extractOfferedAmount(buildOfferText(email)), 1400);
});

test("headers normalize from an object, lowercased", () => {
  const headers = normalizeHeaders({
    "List-Unsubscribe": "<https://example.com/u/1>",
    Precedence: "bulk",
  });
  assert.equal(headers["list-unsubscribe"], "<https://example.com/u/1>");
  assert.equal(headers["precedence"], "bulk");
});

test("headers normalize from the array-of-pairs shape too", () => {
  // Which of the two a provider sends is not pinned anywhere (see the SCHEMA
  // ASSUMPTION note at the top of parse.ts), so both have to work.
  const headers = normalizeHeaders([
    { name: "Auto-Submitted", value: "auto-replied" },
    { name: "Authentication-Results", value: "mx.google.com; spf=fail" },
  ]);
  assert.equal(headers["auto-submitted"], "auto-replied");
  assert.match(headers["authentication-results"], /spf=fail/);
});

test("a missing or unusable header bag is an empty object, never undefined", () => {
  assert.deepEqual(normalizeHeaders(undefined), {});
  assert.deepEqual(normalizeHeaders("List-Unsubscribe: x"), {});
  assert.deepEqual(normalizeInboundEmail({}).headers, {});
});

test("normalizeInboundEmail carries the headers through to the screener", () => {
  const email = normalizeInboundEmail({
    from: "news@example.com",
    to: "ayman.k3f9@analyze.greenlightadvs.com",
    subject: "Digest",
    text: "Stories.",
    headers: { "List-Id": "<news.example.com>" },
  });
  assert.equal(email.headers["list-id"], "<news.example.com>");
});

// --- documented Resend shapes (F1) -------------------------------------------

test("the documented email.received webhook carries no body and no headers", () => {
  const meta = normalizeInboundEmail(webhookPayload());

  assert.equal(meta.providerMessageId, EMAIL_ID, "keyed on email_id");
  assert.notEqual(meta.providerMessageId, RFC_MESSAGE_ID, "never on the RFC Message-ID");
  assert.equal(meta.from, "deals@brand.example");
  assert.equal(meta.subject, "Sponsorship: dedicated video");
  assert.equal(meta.text, "", "nothing to read until the content is fetched");
  assert.deepEqual(meta.headers, {});
  // The alias is only in received_for — what a Gmail forward looks like.
  assert.equal(findInboundAlias(meta.to, "analyze.greenlightadvs.com"), ALIAS);
});

test("a payload with only message_id has no key at all", () => {
  const meta = normalizeInboundEmail({ type: "email.received", data: { message_id: RFC_MESSAGE_ID } });
  assert.equal(meta.providerMessageId, null);
});

test("merging the retrieved content supplies the body and headers", () => {
  const meta = normalizeInboundEmail(webhookPayload());
  const email = mergeReceivedEmail(meta, receivedEmail());

  assert.equal(email.providerMessageId, EMAIL_ID);
  assert.match(email.text, /We can pay \$1,500 for a dedicated video/, "HTML-only body converted");
  assert.ok(!email.text.includes("<strong>"));
  assert.equal(email.headers["return-path"], "bounce@brand.example");
  assert.deepEqual(email.to, meta.to, "recipients stay the webhook's");
  assert.equal(email.subject, meta.subject);
  assert.deepEqual(email.attachments.map((a) => a.filename), ["rate-card.pdf"]);

  const offer = buildOfferText(email);
  assert.match(offer, /^Subject: Sponsorship: dedicated video/);
  assert.match(offer, /dedicated video/);
  assert.equal(extractOfferedAmount(offer), 1500, "the amount in the body is now visible");
});

test("text is preferred over html, and blank text falls back to html", () => {
  const meta = normalizeInboundEmail(webhookPayload());
  assert.equal(
    mergeReceivedEmail(meta, receivedEmail({ text: "Plain offer: $700", html: "<p>HTML offer</p>" })).text,
    "Plain offer: $700",
  );
  assert.equal(
    mergeReceivedEmail(meta, receivedEmail({ text: "  \n ", html: "<p>HTML offer</p>" })).text,
    "HTML offer",
  );
});

test("an Arabic body survives retrieval intact", () => {
  const meta = normalizeInboundEmail(webhookPayload());
  const email = mergeReceivedEmail(meta, receivedEmail({ html: null, text: "مرحبا، نود رعاية فيديو كامل" }));
  assert.equal(email.text, "مرحبا، نود رعاية فيديو كامل");
});

test("missing content leaves an empty body, never a crash", () => {
  const meta = normalizeInboundEmail(webhookPayload());
  const email = mergeReceivedEmail(meta, receivedEmail({ text: null, html: null, headers: undefined, attachments: undefined }));
  assert.equal(email.text, "");
  assert.deepEqual(email.headers, {});
  // The webhook's attachment list is kept when the content has none.
  assert.deepEqual(email.attachments.map((a) => a.filename), ["avatar.png"]);
  assert.equal(buildOfferText(email), "Subject: Sponsorship: dedicated video");

  const bare = mergeReceivedEmail(normalizeInboundEmail(webhookPayload({ subject: undefined })), {});
  assert.equal(buildOfferText(bare), "", "no subject and no body is the intake's empty-body case");
});

test("malformed content fields degrade to absent", () => {
  const meta = normalizeInboundEmail(webhookPayload());
  const email = mergeReceivedEmail(meta, {
    text: undefined,
    html: "<p>ok</p>",
    headers: [{ name: "List-Unsubscribe", value: "<mailto:u@brand.example>" }, null, 5, { value: "no name" }],
    attachments: "not an array",
    from: 12345,
    subject: ["array"],
  });
  assert.equal(email.text, "ok");
  assert.deepEqual(email.headers, { "list-unsubscribe": "<mailto:u@brand.example>" });
  assert.equal(email.from, "deals@brand.example", "the webhook sender is kept");
  assert.deepEqual(email.attachments.map((a) => a.filename), ["avatar.png"]);
});


// --- adversarial content (review Finding 1) ---------------------------------
//
// Every input below is sender-controlled: anyone can mail a creator, and the
// creator's Gmail rule forwards it here. The pre-fix code took seconds to
// minutes on these (80k newlines ≈ 16s, 320k ≈ 246s; 160k of "<a" ≈ 5.7s).
// The ceilings are deliberately loose — 30–100× what the fixed code needs on
// a laptop — so they catch a quadratic regression, not a slow CI machine.
// scripts/parse-perf-check.mjs prints the actual timings.

const LOOSE_CEILING_MS = 2_000;
function timed<T>(f: () => T): { value: T; ms: number } {
  const started = performance.now();
  const value = f();
  return { value, ms: performance.now() - started };
}
const repeat = (unit: string, chars: number) => unit.repeat(Math.ceil(chars / unit.length));

test("stripQuotedReply is linear on long runs of newlines and whitespace", () => {
  for (const unit of ["\n", " \n", "\t\r\n", "\n\n\n "]) {
    // Called directly and uncapped: the function itself must not be quadratic.
    const { ms } = timed(() => stripQuotedReply(repeat(unit, 1_000_000)));
    assert.ok(ms < LOOSE_CEILING_MS, `${JSON.stringify(unit)} x1M took ${ms.toFixed(0)}ms`);
  }
});

test("stripQuotedReply is linear on many near-miss marker lines", () => {
  for (const unit of ["On x\n", "On  wrote\n", "-- Original\n", "_____ x\n", "From:\n", "From: \n"]) {
    const { ms } = timed(() => stripQuotedReply(repeat(unit, 1_000_000)));
    assert.ok(ms < LOOSE_CEILING_MS, `${JSON.stringify(unit)} took ${ms.toFixed(0)}ms`);
  }
});

test("stripQuotedReply still finds markers with indentation and CRLF", () => {
  const crlf = "Can we do 900 instead of the full rate?\r\n\r\n  On Mon, 5 May, Creator wrote:\r\n> my rate is 1200\r\n";
  const stripped = stripQuotedReply(crlf);
  assert.match(stripped, /900 instead/);
  assert.ok(!stripped.includes("1200"));

  const outlook = "Happy to proceed at $700 for the integration.\n\n-----Original Message-----\nFrom: me\nold text";
  assert.equal(stripQuotedReply(outlook), "Happy to proceed at $700 for the integration.");

  const underscore = "Counter-offer: $650 for one short.\n\n________________________________\nFrom: x";
  assert.equal(stripQuotedReply(underscore), "Counter-offer: $650 for one short.");
});

test("htmlToText is linear on repeated incomplete tags", () => {
  for (const unit of ["<a", "<", "<br  ", "</p", "<a href='", "<<>"]) {
    const { ms } = timed(() => htmlToText(repeat(unit, 1_000_000)));
    assert.ok(ms < LOOSE_CEILING_MS, `${JSON.stringify(unit)} x1M took ${ms.toFixed(0)}ms`);
  }
});

test("htmlToText is linear on unclosed or malformed script/style", () => {
  for (const unit of ["<style ", "<script>", "<SCRIPT ", "<script></script", "<style></style <", "<script>x</scrip"]) {
    const { ms } = timed(() => htmlToText(repeat(unit, 1_000_000)));
    assert.ok(ms < LOOSE_CEILING_MS, `${JSON.stringify(unit)} x1M took ${ms.toFixed(0)}ms`);
  }
});

test("script and style blocks are removed, case-insensitively, and an unclosed one runs to the end", () => {
  assert.equal(htmlToText("<p>Offer</p><SCRIPT type=x>steal()</Script ><p>$500</p>"), "Offer\n $500");
  assert.equal(htmlToText("<style>a{}</style>Hi<style>b{}</style>there"), "Hi there");
  assert.equal(htmlToText("Visible <script>never closed <p>hidden</p>"), "Visible");
  // A tag that merely starts with the word is not a script block.
  assert.match(htmlToText("<scripted>kept</scripted>"), /kept/);
  // Lowercasing can change string length ("İ" -> 2 code units); indexes are
  // taken from the original, so text after it is not shifted or lost.
  assert.equal(htmlToText("İİİ<script>x</script>after"), "İİİ after");
});

test("ordinary HTML still converts as before", () => {
  const html = "<div>Hi team,<br>We can pay <b>$1,200</b> for a <i>dedicated video</i>.</div><p>Thanks &amp; regards</p>";
  const text = htmlToText(html);
  assert.equal(text, "Hi team,\nWe can pay $1,200 for a dedicated video .\n Thanks & regards");
  assert.equal(extractOfferedAmount(text), 1200);
});

test("plain text over the input cap is cut before parsing, and the offer says so", () => {
  const offer = "We offer $900 for a dedicated video. ";
  const body = offer + "x".repeat(MAX_TEXT_INPUT_CHARS * 3);
  const email = normalizeInboundEmail({ email_id: "e", subject: "Deal", text: body });

  assert.equal(email.bodyTruncated, true);
  assert.equal(email.text.length, MAX_TEXT_INPUT_CHARS, "cut at the input cap, not after parsing");

  const built = buildOfferText(email);
  assert.ok(built.length <= MAX_OFFER_TEXT);
  assert.ok(built.endsWith(TRUNCATION_NOTICE), "truncation is stated, never silent");
  assert.equal(extractOfferedAmount(built), 900, "the start of the offer survives");
});

test("HTML over the input cap is cut before conversion, and the offer says so", () => {
  const html = "<p>We offer $400 for a story.</p>" + "<p>filler</p>".repeat(MAX_HTML_INPUT_CHARS);
  const email = normalizeInboundEmail({ email_id: "e", subject: "Deal", html });
  assert.equal(email.bodyTruncated, true);
  assert.ok(email.text.length <= MAX_TEXT_INPUT_CHARS);
  assert.ok(buildOfferText(email).endsWith(TRUNCATION_NOTICE));
});

test("input caps: exactly at the limit is whole, one over is truncated", () => {
  const atText = normalizeInboundEmail({ email_id: "e", text: "a".repeat(MAX_TEXT_INPUT_CHARS) });
  assert.equal(atText.bodyTruncated, false);
  const overText = normalizeInboundEmail({ email_id: "e", text: "a".repeat(MAX_TEXT_INPUT_CHARS + 1) });
  assert.equal(overText.bodyTruncated, true);

  // Markup that converts to (almost) nothing, so only the HTML cap is in play.
  const markup = "<b>".repeat(MAX_HTML_INPUT_CHARS / 3);
  assert.equal(markup.length, MAX_HTML_INPUT_CHARS);
  const atHtml = normalizeInboundEmail({ email_id: "e", html: markup });
  assert.equal(atHtml.bodyTruncated, false);
  const overHtml = normalizeInboundEmail({ email_id: "e", html: markup + "x" });
  assert.equal(overHtml.bodyTruncated, true);

  // HTML under its cap whose *text* exceeds the text cap is truncated too.
  const wordy = normalizeInboundEmail({ email_id: "e", html: "b".repeat(MAX_HTML_INPUT_CHARS) });
  assert.equal(wordy.bodyTruncated, true);
  assert.equal(wordy.text.length, MAX_TEXT_INPUT_CHARS);
});

test("a short message is not marked truncated", () => {
  const email = normalizeInboundEmail({ email_id: "e", subject: "Hi", text: "We offer $300 for a post." });
  assert.equal(email.bodyTruncated, false);
  assert.equal(buildOfferText(email), "Subject: Hi\n\nWe offer $300 for a post.");
});

test("an offer cut by the 20k offer limit is marked too", () => {
  const email = normalizeInboundEmail({ email_id: "e", subject: "s", text: "word ".repeat(10_000) });
  assert.equal(email.bodyTruncated, false);
  const built = buildOfferText(email);
  assert.ok(built.length <= MAX_OFFER_TEXT);
  assert.ok(built.endsWith(TRUNCATION_NOTICE));
});

test("the whole adversarial path, capped, stays fast end to end", () => {
  const meta = normalizeInboundEmail(webhookPayload());
  for (const content of [
    { text: repeat("\n", 5_000_000), html: null },
    { text: null, html: repeat("<a", 5_000_000) },
    { text: null, html: repeat("<style ", 5_000_000) },
  ]) {
    const { value, ms } = timed(() => buildOfferText(mergeReceivedEmail(meta, receivedEmail(content))));
    assert.ok(ms < LOOSE_CEILING_MS, `took ${ms.toFixed(0)}ms`);
    assert.ok(value.length <= MAX_OFFER_TEXT);
  }
});

// --- D5: thousands separators and MENA input -----------------------------------

test("dot-grouped thousands are read as thousands, not a fragment (D5)", () => {
  assert.equal(extractOfferedAmount("We offer 1.500 USD"), 1500);
  assert.equal(extractOfferedAmount("budget 1.500$"), 1500);
  assert.equal(extractOfferedAmount("USD 12.000 for the campaign"), 12000);
  assert.equal(extractOfferedAmount("1.500,50 USD"), 1500.5);
  assert.equal(extractOfferedAmount("$1,500.50"), 1500.5);
  assert.equal(extractOfferedAmount("$500. Let us know"), 500);
});

test("Arabic-Indic digits and the Arabic word for dollars are read", () => {
  assert.equal(extractOfferedAmount("ميزانيتنا ٥٠٠٠ دولار"), 5000);
  assert.equal(extractOfferedAmount("نعرض ١٬٥٠٠ دولار"), 1500);
});

test("other currencies are never converted — they stay null", () => {
  for (const text of ["Budget 5000 EGP", "SAR 3,000", "We pay 3,500 AED", "5,000 جنيه", "٥٠٠٠ ريال"]) {
    assert.equal(extractOfferedAmount(text), null, text);
  }
  // A USD figure stated alongside a local one is still the USD figure.
  assert.equal(extractOfferedAmount("EGP 25,000 (~$500)"), 500);
});

test("ambiguous separators are refused rather than guessed", () => {
  assert.equal(parseAmountToken("1..5"), null);
  assert.equal(parseAmountToken("1,50,000"), null);
  assert.equal(parseAmountToken("1.500.5"), null);
  assert.equal(parseAmountToken("1.5"), 1.5);
  assert.equal(parseAmountToken("1,50"), 1.5);
  assert.equal(parseAmountToken("1,500"), 1500);
  assert.equal(parseAmountToken("1.500"), 1500);
});

test("amount extraction stays linear on long digit runs", () => {
  const started = performance.now();
  extractOfferedAmount("$" + "1.".repeat(50_000));
  extractOfferedAmount("1,".repeat(50_000) + " USD");
  assert.ok(performance.now() - started < 1000);
});

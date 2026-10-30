import { strict as assert } from "node:assert";
import { test } from "node:test";

import { quoteSecret } from "./offer-quote.ts";
import {
  MAX_RECOMMENDED_PRICE_USD,
  QUOTE_TTL_MS,
  analysisQuoteSecret,
  readCreateDealSubmission,
  signAnalysisQuote,
  verifyAnalysisQuote,
  type AnalysisQuote,
} from "./analysis-quote.ts";

/** D3: the Manual Analyzer's create step stores only a verdict this server signed. */

const SECRET = analysisQuoteSecret("test-service-role-key")!;
const NOW = 1_800_000_000_000;

const QUOTE: AnalysisQuote = {
  creatorId: "creator-1",
  senderEmail: "deals@brand.example",
  offerText: "We'd like a dedicated video.\nBudget $1,500.",
  sponsorshipType: "video_dedicated",
  targetCountries: ["EG", "SA"],
  risk: "yellow",
  recommendedPriceUsd: 2100,
};

const form = (fields: Record<string, string>) => (name: string) => fields[name] ?? null;
const VALID_FIELDS = {
  sender_email: QUOTE.senderEmail,
  offer_text: QUOTE.offerText,
  sponsorship_type: QUOTE.sponsorshipType,
  target_countries: "EG, SA",
  risk: QUOTE.risk,
  recommended_price_usd: "2100",
};

test("a quote verifies for the same creator and offer", () => {
  const token = signAnalysisQuote(SECRET, QUOTE, NOW);
  assert.equal(verifyAnalysisQuote(SECRET, token, QUOTE, NOW + 1000), "ok");
});

test("CRLF from form submission still verifies", () => {
  const token = signAnalysisQuote(SECRET, QUOTE, NOW);
  assert.equal(
    verifyAnalysisQuote(SECRET, token, { ...QUOTE, offerText: QUOTE.offerText.replace(/\n/g, "\r\n") }, NOW),
    "ok",
  );
});

test("forged verdicts and swapped fields are rejected", () => {
  const token = signAnalysisQuote(SECRET, QUOTE, NOW);
  for (const forged of [
    { risk: "green" },
    { recommendedPriceUsd: 99_999 },
    { creatorId: "creator-2" }, // another creator replaying this token
    { senderEmail: "other@brand.example" },
    { offerText: QUOTE.offerText + " Actually $50." },
    { sponsorshipType: "post" },
    { targetCountries: ["US"] },
  ] as Partial<AnalysisQuote>[]) {
    assert.equal(verifyAnalysisQuote(SECRET, token, { ...QUOTE, ...forged }, NOW), "invalid", JSON.stringify(forged));
  }
});

test("missing, malformed or wrong-key tokens are rejected", () => {
  const token = signAnalysisQuote(SECRET, QUOTE, NOW);
  for (const bad of ["", "abc", `${NOW}`, `${NOW}.`, `${NOW}.x.y`, `x.${token.split(".")[1]}`]) {
    assert.equal(verifyAnalysisQuote(SECRET, bad, QUOTE, NOW), "invalid", bad);
  }
  assert.equal(verifyAnalysisQuote(analysisQuoteSecret("other-key")!, token, QUOTE, NOW), "invalid");
});

test("a Discover offer-quote key cannot sign an analysis quote", () => {
  const discoverKey = quoteSecret("test-service-role-key")!;
  const token = signAnalysisQuote(discoverKey, QUOTE, NOW);
  assert.equal(verifyAnalysisQuote(SECRET, token, QUOTE, NOW), "invalid");
});

test("expiry: valid until the TTL, expired after, never from the future", () => {
  const token = signAnalysisQuote(SECRET, QUOTE, NOW);
  assert.equal(verifyAnalysisQuote(SECRET, token, QUOTE, NOW + QUOTE_TTL_MS), "ok");
  assert.equal(verifyAnalysisQuote(SECRET, token, QUOTE, NOW + QUOTE_TTL_MS + 1), "expired");
  const future = signAnalysisQuote(SECRET, QUOTE, NOW + 5 * 60_000);
  assert.equal(verifyAnalysisQuote(SECRET, future, QUOTE, NOW), "invalid");
});

test("no signing key means no secret", () => {
  assert.equal(analysisQuoteSecret(undefined), null);
  assert.equal(analysisQuoteSecret(""), null);
});

test("a valid submission round-trips to the signed quote", () => {
  const sub = readCreateDealSubmission("creator-1", form(VALID_FIELDS));
  assert.ok(sub.ok);
  if (sub.ok) {
    assert.deepEqual(sub.quote, QUOTE);
    const token = signAnalysisQuote(SECRET, QUOTE, NOW);
    assert.equal(verifyAnalysisQuote(SECRET, token, sub.quote, NOW), "ok");
  }
});

test("the creator id comes from the session, never the form", () => {
  const sub = readCreateDealSubmission("creator-1", form({ ...VALID_FIELDS, creator_id: "creator-9" }));
  assert.ok(sub.ok);
  if (sub.ok) assert.equal(sub.quote.creatorId, "creator-1");
});

test("server-side validation rejects malformed submissions", () => {
  for (const bad of [
    { sender_email: "" },
    { sender_email: "not-an-email" },
    { offer_text: "" },
    { offer_text: "x".repeat(20_001) },
    { sponsorship_type: "billboard" },
    { risk: "purple" },
    { risk: "" },
    { recommended_price_usd: "" },
    { recommended_price_usd: "0" },
    { recommended_price_usd: "-5" },
    { recommended_price_usd: "1e9" },
    { recommended_price_usd: "NaN" },
    { recommended_price_usd: "Infinity" },
    { recommended_price_usd: String(MAX_RECOMMENDED_PRICE_USD + 1) },
  ]) {
    const sub = readCreateDealSubmission("creator-1", form({ ...VALID_FIELDS, ...bad }));
    assert.equal(sub.ok, false, JSON.stringify(bad));
  }
});

test("non-string form values (files) are treated as missing", () => {
  const sub = readCreateDealSubmission("creator-1", (name) =>
    name === "offer_text" ? new Blob(["x"]) : (VALID_FIELDS as Record<string, string>)[name],
  );
  assert.equal(sub.ok, false);
});

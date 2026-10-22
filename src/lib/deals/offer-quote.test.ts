import { strict as assert } from "node:assert";
import { test } from "node:test";

import { QUOTE_TTL_MS, quoteSecret, signQuote, verifyQuote, type OfferQuote } from "./offer-quote.ts";

/**
 * The Discover send step stores a risk rating and a recommended price that
 * arrived from the company's browser. This signature is the only thing that
 * stops the company choosing them, so each way of changing them is tried.
 */

const secret = quoteSecret("service-role-key-for-tests")!;
const quote: OfferQuote = {
  companyId: "11111111-1111-4111-8111-111111111111",
  creatorId: "22222222-2222-4222-8222-222222222222",
  offerText: "We'd love an integration in your next video.\nBudget is flexible.",
  sponsorshipType: "integration",
  targetCountries: ["EG", "SA"],
  risk: "yellow",
  recommendedPriceUsd: 1250,
  offeredAmount: 400,
};
const now = 1_800_000_000_000;

test("a quote verifies for exactly what was previewed", () => {
  assert.equal(verifyQuote(secret, signQuote(secret, quote, now), quote, now + 1000), "ok");
});

test("changing any priced field invalidates it", () => {
  const token = signQuote(secret, quote, now);
  const tampered: Partial<OfferQuote>[] = [
    { risk: "green" },
    { recommendedPriceUsd: 400 },
    { offeredAmount: 4000 },
    { offerText: "A completely different offer" },
    { creatorId: "33333333-3333-4333-8333-333333333333" },
    { companyId: "44444444-4444-4444-8444-444444444444" }, // another company replaying it
    { sponsorshipType: "video_dedicated" },
    { targetCountries: ["US"] },
  ];
  for (const change of tampered) {
    assert.equal(verifyQuote(secret, token, { ...quote, ...change }, now), "invalid", JSON.stringify(change));
  }
});

test("survives the CRLF that form submission puts into the offer text", () => {
  const token = signQuote(secret, quote, now);
  const submitted = { ...quote, offerText: quote.offerText.replace(/\n/g, "\r\n") };
  assert.equal(verifyQuote(secret, token, submitted, now), "ok");
});

test("expires, but only after its signature is checked", () => {
  const token = signQuote(secret, quote, now);
  assert.equal(verifyQuote(secret, token, quote, now + QUOTE_TTL_MS + 1), "expired");
  const forged = `${now}.${"A".repeat(43)}`;
  assert.equal(verifyQuote(secret, forged, quote, now + QUOTE_TTL_MS + 1), "invalid");
});

test("rejects malformed tokens and a different server's key", () => {
  for (const token of ["", "abc", "123", `${now}.`, `${now}.x.y`, `-1.${"A".repeat(43)}`]) {
    assert.equal(verifyQuote(secret, token, quote, now), "invalid", token);
  }
  const other = quoteSecret("another-deployment")!;
  assert.equal(verifyQuote(other, signQuote(secret, quote, now), quote, now), "invalid");
});

test("rejects a timestamp set in the future", () => {
  assert.equal(verifyQuote(secret, signQuote(secret, quote, now + 3_600_000), quote, now), "invalid");
});

test("no key, no signing", () => {
  assert.equal(quoteSecret(undefined), null);
  assert.equal(quoteSecret(""), null);
});

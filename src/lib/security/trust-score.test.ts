import { strict as assert } from "node:assert";
import { test } from "node:test";

import { computeTrustScore } from "./trust-score.ts";
import type { SafeBrowsingResult, WhoisResult } from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const agoIso = (ms: number) => new Date(Date.now() - ms).toISOString();
const inIso = (ms: number) => new Date(Date.now() + ms).toISOString();

function whois(overrides: Partial<WhoisResult> = {}): WhoisResult {
  return {
    domain: "sponsor.example",
    createdAt: agoIso(5 * 365 * DAY_MS),
    expiresAt: inIso(2 * 365 * DAY_MS),
    registrantOrganization: "Sponsor LLC",
    registrantName: "Jane Doe",
    registrantCountry: "US",
    whoisServer: "whois.example",
    ...overrides,
  };
}

const clean: SafeBrowsingResult = { flagged: false, threatTypes: [] };

test("both checks failing returns score null, never a numeric default", () => {
  const result = computeTrustScore(null, null);
  assert.equal(result.score, null);
  assert.deepEqual(result.reasons, []);
});

test("a clean, established domain scores 100", () => {
  const result = computeTrustScore(clean, whois());
  assert.equal(result.score, 100);
  assert.deepEqual(result.reasons, []);
});

test("a Safe Browsing flag deducts 70", () => {
  const result = computeTrustScore(
    { flagged: true, threatTypes: ["MALWARE"] },
    whois(),
  );
  assert.equal(result.score, 30);
  assert.ok(result.reasons.some((r) => r.includes("MALWARE")));
});

test("a domain under 6 months old deducts 25", () => {
  const result = computeTrustScore(clean, whois({ createdAt: agoIso(30 * DAY_MS) }));
  assert.equal(result.score, 75);
});

test("a domain 6-12 months old deducts 10, not 25", () => {
  const result = computeTrustScore(clean, whois({ createdAt: agoIso(200 * DAY_MS) }));
  assert.equal(result.score, 90);
});

test("expiring within 30 days deducts 20", () => {
  const result = computeTrustScore(clean, whois({ expiresAt: inIso(10 * DAY_MS) }));
  assert.equal(result.score, 80);
});

test("expiring within 90 days deducts 10, not 20", () => {
  const result = computeTrustScore(clean, whois({ expiresAt: inIso(60 * DAY_MS) }));
  assert.equal(result.score, 90);
});

test("redacted registrant org AND name deducts 10", () => {
  const result = computeTrustScore(
    clean,
    whois({ registrantOrganization: "REDACTED FOR PRIVACY", registrantName: "REDACTED FOR PRIVACY" }),
  );
  assert.equal(result.score, 90);
});

test("a visible organization name is not penalized even if the personal name is private", () => {
  const result = computeTrustScore(
    clean,
    whois({ registrantOrganization: "Sponsor LLC", registrantName: "REDACTED FOR PRIVACY" }),
  );
  assert.equal(result.score, 100);
});

test("score never drops below 0", () => {
  const result = computeTrustScore(
    { flagged: true, threatTypes: ["MALWARE", "SOCIAL_ENGINEERING"] },
    whois({
      createdAt: agoIso(10 * DAY_MS),
      expiresAt: inIso(5 * DAY_MS),
      registrantOrganization: null,
      registrantName: null,
    }),
  );
  assert.equal(result.score, 0);
});

test("Safe Browsing succeeding alone still scores, using only that signal", () => {
  const result = computeTrustScore({ flagged: true, threatTypes: ["MALWARE"] }, null);
  assert.equal(result.score, 30);
});

test("WHOIS succeeding alone still scores, using only that signal", () => {
  const result = computeTrustScore(null, whois());
  assert.equal(result.score, 100);
});

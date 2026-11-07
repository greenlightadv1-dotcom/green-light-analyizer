import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { normalizeCompanyProfile, normalizeSecurityCheck } from "./intel-shape.ts";

const validCheck = {
  domain: "brand.example",
  safeBrowsing: { flagged: false, threatTypes: [] },
  whois: { domain: "brand.example", createdAt: "2019-01-01T00:00:00Z", expiresAt: null, registrantOrganization: "Brand", registrantName: null, registrantCountry: "EG", whoisServer: null },
  trustScore: 72,
  reasons: ["Domain is under a year old"],
};
const validProfile = {
  domain: "brand.example", isKnownToModel: true, background: "b", history: "h", trustworthinessScore: 64,
  band: "medium", signals: ["s1"], confidence: "low", generatedAt: "2026-11-01T10:00:00.000Z",
};

test("a valid security check comes back unchanged", () => {
  assert.deepEqual(normalizeSecurityCheck(validCheck), validCheck);
});

test("the shapes that used to crash the room render safely", () => {
  // The exact case seen on 2026-11-06: an object without `reasons`.
  assert.deepEqual(normalizeSecurityCheck({ domain: "x.example" }), { domain: "x.example", safeBrowsing: null, whois: null, trustScore: null, reasons: [] });
  assert.deepEqual(normalizeSecurityCheck({ ...validCheck, reasons: "not a list" })?.reasons, []);
  assert.deepEqual(normalizeSecurityCheck({ ...validCheck, reasons: ["ok", 3, null] })?.reasons, ["ok"]);
  assert.deepEqual(normalizeSecurityCheck({ ...validCheck, safeBrowsing: { flagged: true, threatTypes: "MALWARE" } })?.safeBrowsing, { flagged: true, threatTypes: [] });
  assert.equal(normalizeSecurityCheck({ ...validCheck, safeBrowsing: { threatTypes: [] } })?.safeBrowsing, null);
  assert.equal(normalizeSecurityCheck({ ...validCheck, whois: { createdAt: "x" } })?.whois, null);
  assert.equal(normalizeSecurityCheck({ ...validCheck, trustScore: "72" })?.trustScore, null);
  assert.equal(normalizeSecurityCheck({ ...validCheck, trustScore: Number.NaN })?.trustScore, null);
});

test("no object, or no domain, means no security check", () => {
  for (const v of [null, undefined, {}, [], "x", 1, true, { domain: "" }, { domain: 5 }]) {
    assert.equal(normalizeSecurityCheck(v), null, JSON.stringify(v));
  }
});

test("a valid company brief comes back unchanged", () => {
  assert.deepEqual(normalizeCompanyProfile(validProfile), validProfile);
});

test("an incomplete company brief is treated as absent, never half-shown", () => {
  for (const broken of [
    {}, null, [], "x",
    { ...validProfile, trustworthinessScore: undefined },
    { ...validProfile, band: "huge" },
    { ...validProfile, confidence: undefined },
    { ...validProfile, isKnownToModel: "yes" },
    { ...validProfile, generatedAt: "not a date" },
    { ...validProfile, domain: undefined },
  ]) assert.equal(normalizeCompanyProfile(broken), null, JSON.stringify(broken));
});

test("optional brief fields degrade to empty, never to invented text", () => {
  const p = normalizeCompanyProfile({ ...validProfile, background: 7, history: undefined, signals: "x" });
  assert.equal(p?.background, "");
  assert.equal(p?.history, "");
  assert.deepEqual(p?.signals, []);
});

test("the deal room and the company-brief action read these columns only through the normalizer", () => {
  const panel = readFileSync(new URL("../../components/deals/CompanyIntelligencePanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /normalizeSecurityCheck\(chat\.security_check\)/);
  assert.match(panel, /normalizeCompanyProfile\(intelState\.profile \?\? chat\.company_profile\)/);
  assert.doesNotMatch(panel, /chat\.security_check\?\./, "raw security_check field access in the panel");
  const action = readFileSync(new URL("../../app/(app)/inbox/[chatId]/actions.ts", import.meta.url), "utf8");
  assert.match(action, /normalizeSecurityCheck\(chat\.security_check\)/);
});

test("the company-intelligence panel sits inside an error boundary, so the chat always renders", () => {
  const room = readFileSync(new URL("../../components/views/DealRoomView.tsx", import.meta.url), "utf8");
  assert.match(room, /<PanelBoundary fallback=\{[\s\S]*?\}>\s*<CompanyIntelligencePanel /);
});

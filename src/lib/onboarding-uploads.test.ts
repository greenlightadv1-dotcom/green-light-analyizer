import { strict as assert } from "node:assert";
import { test } from "node:test";

import { parseAccessRequest, roleForJourney } from "./access-requests.ts";
import { checkUpload, isOwnedPath, ownedAvatarPath, safeFileName, sniffType } from "./uploads.ts";

/** Get Started application validation and upload security. */

const form = (o: Record<string, string>) => new Map(Object.entries(o));
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

test("a creator application needs a name, a valid email and a platform", () => {
  const ok = parseAccessRequest(form({ journey: "creator", full_name: "Nour", email: "Nour@Example.com", primary_platform: "youtube" }));
  assert.ok(ok.ok && ok.value.email === "nour@example.com");
  const bad = parseAccessRequest(form({ journey: "creator", full_name: "", email: "not-an-email" }));
  assert.ok(!bad.ok);
  if (!bad.ok) assert.deepEqual(bad.errors, { full_name: "required", email: "invalid", primary_platform: "required" });
});

test("company and representative applications must name the company", () => {
  for (const journey of ["company", "company_representative"]) {
    const r = parseAccessRequest(form({ journey, full_name: "Sara", email: "sara@brand.com" }));
    assert.ok(!r.ok && r.errors.company_name === "required");
  }
  assert.equal(roleForJourney("company_representative"), "company");
  assert.equal(roleForJourney("creator"), "creator");
});

test("unknown journeys, bad websites and oversized fields are refused", () => {
  assert.ok(!parseAccessRequest(form({ journey: "admin", full_name: "x", email: "a@b.co" })).ok);
  const r = parseAccessRequest(form({ journey: "company", full_name: "Sara", email: "sara@brand.com", company_name: "Brand", website: "javascript:alert(1)" }));
  assert.ok(!r.ok && r.errors.website === "invalid");
  const long = parseAccessRequest(form({ journey: "company", full_name: "Sara", email: "sara@brand.com", company_name: "Brand", message: "x".repeat(1001) }));
  assert.ok(!long.ok && long.errors.message === "too_long");
  const fixed = parseAccessRequest(form({ journey: "company", full_name: "Sara", email: "sara@brand.com", company_name: "Brand", website: "brand.com" }));
  assert.ok(fixed.ok && fixed.value.website === "https://brand.com");
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script>");
const SVG = new TextEncoder().encode("<svg onload=alert(1)>");

test("file type is decided by content, never by name or declared type", () => {
  assert.equal(sniffType(PNG), "image/png");
  assert.equal(sniffType(JPG), "image/jpeg");
  assert.equal(sniffType(WEBP), "image/webp");
  assert.equal(sniffType(PDF), "application/pdf");
  assert.equal(sniffType(HTML), null);
  assert.equal(sniffType(SVG), null);
});

test("avatars accept images only, documents also PDF; sizes are bounded", () => {
  assert.deepEqual(checkUpload("avatar", 1000, PNG), { ok: true, type: "image/png" });
  assert.deepEqual(checkUpload("avatar", 1000, PDF), { ok: false, error: "type" });
  assert.deepEqual(checkUpload("document", 1000, PDF), { ok: true, type: "application/pdf" });
  assert.deepEqual(checkUpload("avatar", 3 * 1024 * 1024, PNG), { ok: false, error: "too_large" });
  assert.deepEqual(checkUpload("document", 6 * 1024 * 1024, PDF), { ok: false, error: "too_large" });
  assert.deepEqual(checkUpload("document", 0, PDF), { ok: false, error: "empty" });
  assert.deepEqual(checkUpload("document", 100, HTML), { ok: false, error: "type" });
});

test("paths must stay inside the owner's folder", () => {
  assert.ok(isOwnedPath(OWNER, `${OWNER}/doc-abc.pdf`));
  assert.ok(!isOwnedPath(OWNER, `${OTHER}/doc-abc.pdf`));
  assert.ok(!isOwnedPath(OWNER, `${OWNER}/../${OTHER}/x.pdf`));
  assert.ok(!isOwnedPath(OWNER, `${OWNER}/nested/x.pdf`));
  assert.ok(!isOwnedPath(OWNER, `${OWNER}/.hidden`));
  assert.ok(!isOwnedPath("not-a-uuid", "not-a-uuid/x.pdf"));
});

test("only our own avatar objects are ever deleted on replace", () => {
  const base = "https://x.supabase.co/storage/v1/object/public/avatars/";
  assert.equal(ownedAvatarPath(OWNER, `${base}${OWNER}/avatar-1.png`, base), `${OWNER}/avatar-1.png`);
  assert.equal(ownedAvatarPath(OWNER, `${base}${OTHER}/avatar-1.png`, base), null);
  assert.equal(ownedAvatarPath(OWNER, "https://elsewhere.com/me.png", base), null);
});

test("file names are made display-safe", () => {
  assert.equal(safeFileName("../../etc/passwd"), "passwd");
  assert.equal(safeFileName("رسالة <b>.pdf"), "b-.pdf");
  assert.equal(safeFileName(""), "file");
});

import { companyDetailsComplete, companyOnboarding, creatorOnboarding } from "./onboarding.ts";

const facts = { kitCount: 0, analyticsConnected: false, emailDealSeen: false, representsCompany: null };
const creator = { role: "creator" as const, full_name: "N", bio: null, country: null, primary_language: null, avatar_url: null, inbound_alias: "n.ab12@x.com", creator_categories: [] };

test("creator onboarding reflects real data and resumes where the data says", () => {
  const empty = creatorOnboarding(creator, facts);
  assert.equal(empty.complete, false);
  assert.equal(empty.done, 1); // the account itself
  const full = creatorOnboarding(
    { ...creator, bio: "b", country: "EG", primary_language: "Arabic", avatar_url: "u", creator_categories: ["gaming"] },
    { ...facts, kitCount: 1, emailDealSeen: true },
  );
  assert.equal(full.complete, true);
  // Analytics is optional and does not block completion.
  assert.equal(full.steps.find((s) => s.id === "analytics")!.done, false);
});

test("company details need a description and, once 0024 exists, an industry", () => {
  const base = { role: "company" as const, full_name: "Brand", bio: "We make games", country: null, primary_language: null, avatar_url: null, inbound_alias: null };
  assert.equal(companyDetailsComplete(base), true); // pre-0024 database: no industry column
  assert.equal(companyDetailsComplete({ ...base, company_industry: null }), false);
  assert.equal(companyDetailsComplete({ ...base, company_industry: "Gaming" }), true);
  const rep = companyOnboarding({ ...base, company_industry: "Gaming" }, { ...facts, representsCompany: "Brand HQ" });
  assert.ok(rep.steps.some((s) => s.id === "company_link" && s.done));
  assert.equal(rep.complete, true);
});

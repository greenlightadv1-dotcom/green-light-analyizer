import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DOCUMENTS, kindsForRole, missingDocuments, parseDetails, prefill, verificationErrorKey } from "./rules.ts";
import { decisionEmail } from "./email.ts";

test("only creators and companies open cases, never admins", () => {
  assert.deepEqual(kindsForRole("creator"), ["creator_kyc"]);
  assert.deepEqual(kindsForRole("company"), ["company_kyb", "representative"]);
  assert.deepEqual(kindsForRole("admin"), []);
});

test("details are validated; drafts may be partial, submissions may not", () => {
  const ok = parseDetails("creator_kyc", { legal_name: " Layla ", date_of_birth: "1998-02-03", nationality: "eg", phone: "+20 101 234 5678", junk: "x" }, { requireAll: true });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.value, { legal_name: "Layla", date_of_birth: "1998-02-03", nationality: "EG", phone: "+20 101 234 5678" });
  assert.deepEqual(parseDetails("creator_kyc", { legal_name: "Layla" }, { requireAll: true }), { ok: false, field: "date_of_birth" });
  assert.ok(parseDetails("creator_kyc", { legal_name: "Layla" }, { requireAll: false }).ok);
  assert.deepEqual(parseDetails("creator_kyc", { date_of_birth: "2999-01-01" }, { requireAll: false }), { ok: false, field: "date_of_birth" });
  assert.deepEqual(parseDetails("creator_kyc", { date_of_birth: "2001-02-30" }, { requireAll: false }), { ok: false, field: "date_of_birth" });
  assert.deepEqual(parseDetails("company_kyb", { website: "javascript:alert(1)" }, { requireAll: false }), { ok: false, field: "website" });
  assert.deepEqual(parseDetails("creator_kyc", { phone: "call me" }, { requireAll: false }), { ok: false, field: "phone" });
});

test("data already on the profile is offered, never overriding what was saved", () => {
  const p = prefill("creator_kyc", { legal_name: "Saved Name" }, { full_name: "Profile Name", country: "EG" });
  assert.equal(p.values.legal_name, "Saved Name");
  assert.equal(p.values.nationality, "EG");
  assert.deepEqual(p.missing, ["date_of_birth", "phone"]);
  const c = prefill("company_kyb", {}, { full_name: "Nimbus", company_website: "https://nimbus.example" });
  assert.equal(c.values.website, "https://nimbus.example");
});

test("required documents mirror the database rule", () => {
  assert.deepEqual(missingDocuments("creator_kyc", ["passport"]), []);
  assert.deepEqual(missingDocuments("company_kyb", ["tax_card"]), [["commercial_register"]]);
  assert.deepEqual(missingDocuments("representative", []), [["authorization_letter"]]);
  assert.ok(!DOCUMENTS.creator_kyc.allowed.includes("commercial_register"));
  const sql = readFileSync(new URL("../../../supabase/migrations/0032_verification.sql", import.meta.url), "utf8");
  assert.match(sql, /c\.kind = 'creator_kyc' and not \(v_docs && array\['id_front', 'passport'\]\)/);
  assert.match(sql, /c\.kind = 'company_kyb' and not \(v_docs @> array\['commercial_register', 'tax_card'\]\)/);
});

test("refusals map to keys", () => {
  assert.equal(verificationErrorKey("verification:documents_missing"), "verification.errors.documents_missing");
  assert.equal(verificationErrorKey("boom"), "ui.errors.generic");
});

test("decision emails state no price and never call the account identity-verified", () => {
  for (const kind of ["creator_kyc", "company_kyb", "representative"] as const) {
    for (const d of ["approved", "rejected", "needs_info"] as const) {
      const m = decisionEmail(kind, d, "https://www.greenlightadvs.com/", "note");
      assert.doesNotMatch(m.message, /\$\d|identity verified/i);
      assert.match(m.ctaUrl, /^https:\/\/www\.greenlightadvs\.com\//);
    }
  }
  assert.match(decisionEmail("creator_kyc", "approved", "https://x.example").message, /10% commission/);
});

test("verification code paths never expose document URLs to non-admins", () => {
  const route = readFileSync(new URL("../../app/api/verification/documents/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /createSignedUrl|getPublicUrl/);
  assert.match(route, /\.eq\("profile_id", profileId\)/);
  const adminActions = readFileSync(new URL("../../app/(app)/admin/verification/actions.ts", import.meta.url), "utf8");
  for (const fn of adminActions.split("\nexport async function ").slice(1)) assert.match(fn, /requireRole\("admin"\)/);
  assert.match(adminActions, /createSignedUrl\(doc\.storage_path, 300\)/);
  assert.match(adminActions, /event: "document_viewed"/);
  const own = readFileSync(new URL("../../app/verification/actions.ts", import.meta.url), "utf8");
  for (const fn of own.split("\nexport async function ").slice(1)) assert.match(fn, /requireAnyStatusProfile\(\)/);
  assert.doesNotMatch(own, /fd\.get\("profile_id"\)|p_actor: (?!profile\.id)/);
  const auth = readFileSync(new URL("../auth.ts", import.meta.url), "utf8");
  assert.match(auth, /account_status !== "active"\) redirect\("\/verification"\)/);
});

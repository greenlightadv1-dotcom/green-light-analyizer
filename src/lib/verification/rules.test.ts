import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DOCUMENTS, FIELDS, STEPS, formDetails, kindsForRole, mergeDetails, missingDocuments, missingFields, parseDetails, prefill, verificationErrorKey } from "./rules.ts";
import { decisionEmail } from "./email.ts";

test("only creators and companies open cases, never admins", () => {
  assert.deepEqual(kindsForRole("creator"), ["creator_kyc"]);
  assert.deepEqual(kindsForRole("company"), ["company_kyb", "representative"]);
  assert.deepEqual(kindsForRole("admin"), []);
});

test("details are validated; drafts may be partial, submissions may not", () => {
  const ok = parseDetails("creator_kyc", { legal_name: " Layla ", date_of_birth: "1998-02-03", nationality: "eg", id_number: "••••89", phone: "+20 101 234 5678", main_platform: "youtube", handle: "@layla", categories: "gaming,tech", junk: "x" }, { requireAll: true });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.value, { legal_name: "Layla", date_of_birth: "1998-02-03", nationality: "EG", id_number: "••••89", phone: "+201012345678", main_platform: "youtube", handle: "@layla", categories: "gaming,tech" });
  // 0041: a plaintext ID number can never be stored, whoever calls.
  assert.deepEqual(parseDetails("creator_kyc", { id_number: "29801011234567" }, { requireAll: false }), { ok: false, field: "id_number" });
  assert.deepEqual(mergeDetails("representative", {}, { id_number: "A1234567" }), { ok: false, field: "id_number" });
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
  assert.deepEqual(p.missing, ["date_of_birth", "id_number", "phone", "main_platform", "handle", "categories"]);
  // Free text from the application pre-fills a choice only when it is one of the choices.
  assert.equal(prefill("creator_kyc", {}, { primary_platform: "YouTube", channel_handle: "@layla" }).values.main_platform, "youtube");
  assert.equal(prefill("creator_kyc", {}, { primary_platform: "my blog", channel_handle: "has spaces" }).values.main_platform, undefined);
  assert.equal(prefill("creator_kyc", {}, { channel_handle: "has spaces" }).values.handle, undefined);
  const c = prefill("company_kyb", {}, { full_name: "Nimbus", company_website: "https://nimbus.example" });
  assert.equal(c.values.website, "https://nimbus.example");
});

test("required documents mirror the database rule", () => {
  // A creator needs all three camera images; a passport or a gallery file is not accepted.
  assert.deepEqual(missingDocuments("creator_kyc", ["passport" as never]), [["selfie"], ["id_front"], ["id_back"]]);
  assert.deepEqual(missingDocuments("creator_kyc", ["selfie", "id_front", "id_back"]), []);
  assert.deepEqual(DOCUMENTS.creator_kyc.upload, ["profile_photo"]);
  // The public photo is required for an application only, and is never an identity image.
  assert.deepEqual(missingDocuments("creator_kyc", ["selfie", "id_front", "id_back"], { application: true }), [["profile_photo"]]);
  assert.ok(!DOCUMENTS.creator_kyc.camera.includes("profile_photo"));
  assert.deepEqual(DOCUMENTS.creator_kyc.camera, ["selfie", "id_front", "id_back"]);
  // A company needs registration, tax card and evidence the applicant may act for it.
  assert.deepEqual(missingDocuments("company_kyb", ["tax_card"]), [["commercial_register"], ["authorization_letter"]]);
  // A representative proves who they are (camera) and that they may act for the company.
  assert.deepEqual(missingDocuments("representative", []), [["selfie"], ["id_front"], ["id_back"], ["authorization_letter"]]);
  assert.deepEqual(DOCUMENTS.representative.camera, ["selfie", "id_front", "id_back"]);
  const sql39 = readFileSync(new URL("../../../supabase/migrations/0039_registration_trust.sql", import.meta.url), "utf8");
  assert.match(sql39, /new\.kind = 'representative' and not \(v_docs @> array\['selfie', 'id_front', 'id_back'\]\)/);
  assert.match(sql39, /new\.kind = 'creator_kyc' and new\.access_request_id is not null and not \(v_docs @> array\['profile_photo'\]\)/);
  assert.match(sql39, /raise exception 'verification:email_unverified'/);
  assert.ok(!DOCUMENTS.creator_kyc.allowed.includes("commercial_register"));
  for (const k of ["company_kyb", "representative"] as const) for (const d of ["selfie", "id_front", "id_back"] as const) assert.ok(!DOCUMENTS[k].upload.includes(d));
  const sql = readFileSync(new URL("../../../supabase/migrations/0032_verification.sql", import.meta.url), "utf8");
  assert.match(sql, /c\.kind = 'creator_kyc' and not \(v_docs @> array\['selfie', 'id_front', 'id_back'\]\)/);
  assert.match(sql, /c\.kind = 'company_kyb' and not \(v_docs @> array\['commercial_register', 'tax_card', 'authorization_letter'\]\)/);
  assert.match(sql, /verification_identity_images_are_camera check/);
});

test("the new fields are validated", () => {
  const bad = (k: string, v: string) => parseDetails("creator_kyc", { [k]: v }, { requireAll: false });
  assert.deepEqual(bad("main_platform", "myspace"), { ok: false, field: "main_platform" });
  assert.deepEqual(bad("handle", "two words"), { ok: false, field: "handle" });
  assert.deepEqual(bad("categories", "gaming,tech,food,music"), { ok: false, field: "categories" });
  assert.deepEqual(bad("categories", "gaming,not_a_category"), { ok: false, field: "categories" });
  assert.deepEqual(bad("profile_links", "https://a.example\njavascript:alert(1)"), { ok: false, field: "profile_links" });
  assert.deepEqual(bad("profile_links", Array.from({ length: 6 }, (_, i) => `https://a${i}.example`).join("\n")), { ok: false, field: "profile_links" });
  const links = parseDetails("creator_kyc", { profile_links: " https://a.example , https://b.example " }, { requireAll: false });
  assert.ok(links.ok && links.value.profile_links === "https://a.example\nhttps://b.example");
  const dupes = parseDetails("creator_kyc", { categories: "gaming,gaming,tech" }, { requireAll: false });
  assert.ok(dupes.ok && dupes.value.categories === "gaming,tech");
  assert.deepEqual(parseDetails("company_kyb", { registered_name: "N", registration_number: "1", tax_number: "2", country: "EG", contact_name: "A", contact_phone: "+201012345678" }, { requireAll: true }), { ok: false, field: "business_activity" });
});

test("a step saves only its own fields and keeps the others", () => {
  const saved = { legal_name: "Layla", phone: "+201012345678", junk: "x" };
  const m = mergeDetails("creator_kyc", saved, { main_platform: "youtube", handle: "@layla", categories: "gaming", profile_links: "" });
  assert.deepEqual(m, { ok: true, value: { legal_name: "Layla", phone: "+201012345678", main_platform: "youtube", handle: "@layla", categories: "gaming" } });
  // A field the step carries but left empty is cleared; a field it does not carry is kept.
  assert.deepEqual(mergeDetails("creator_kyc", { legal_name: "Layla", handle: "@l" }, { handle: "" }), { ok: true, value: { legal_name: "Layla" } });
  assert.deepEqual(mergeDetails("creator_kyc", saved, { handle: "bad handle" }), { ok: false, field: "handle" });
  // Checkbox groups arrive as repeated keys, with an empty hidden marker so "none" is expressible.
  assert.deepEqual(formDetails([["categories", ""], ["categories", "gaming"], ["categories", "tech"], ["case_id", "x"]]), { categories: "gaming,tech", case_id: "x" });
  assert.deepEqual(formDetails([["categories", ""]]), { categories: "" });
  assert.deepEqual(missingFields("representative", { legal_name: "A" }), ["id_number", "phone", "company_name", "job_title"]);
});

test("every field and document belongs to exactly one step, and the review comes last", () => {
  for (const kind of ["creator_kyc", "company_kyb", "representative"] as const) {
    const fields = STEPS[kind].flatMap((s) => s.fields);
    const docs = STEPS[kind].flatMap((s) => s.docs);
    assert.deepEqual([...fields].sort(), FIELDS[kind].map((f) => f.key).sort(), kind);
    assert.equal(new Set(fields).size, fields.length);
    assert.deepEqual([...docs].sort(), [...DOCUMENTS[kind].allowed].sort(), kind);
    assert.equal(STEPS[kind].at(-1)?.id, "review");
  }
});

test("refusals map to keys", () => {
  assert.equal(verificationErrorKey("verification:email_unverified"), "verification.errors.email_unverified");
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

test("verification code paths never expose document URLs to anyone but a reviewer", () => {
  const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  for (const p of ["app/api/verification/documents/route.ts", "app/api/applications/documents/route.ts", "lib/verification/documents-server.ts", "lib/verification/application.ts"]) {
    assert.doesNotMatch(src(p), /createSignedUrl|getPublicUrl/, p);
  }
  const route = src("app/api/verification/documents/route.ts");
  assert.match(route, /\.eq\("profile_id", profileId\)/);
  // The application route resolves ownership from the resume cookie, never from a form id alone.
  const appRoute = src("app/api/applications/documents/route.ts");
  assert.match(appRoute, /currentApplication\(\)/);
  assert.match(appRoute, /app\.cases\.find\(/);
  // Object names are generated on the server.
  assert.match(src("lib/verification/documents-server.ts"), /const path = `\$\{caseRow\.id\}\/\$\{crypto\.randomUUID\(\)\}\.\$\{EXTENSION\[type\]\}`/);
  const adminActions = src("app/(app)/admin/verification/actions.ts");
  for (const fn of adminActions.split("\nexport async function ").slice(1)) {
    assert.match(fn, /requireReviewer\(\)/);
    assert.match(fn, /if \(!reviewer\)/);
  }
  assert.match(adminActions, /createSignedUrl\(doc\.storage_path, 300\)/);
  assert.match(adminActions, /event: "document_viewed"/);
  const own = readFileSync(new URL("../../app/verification/actions.ts", import.meta.url), "utf8");
  for (const fn of own.split("\nexport async function ").slice(1)) assert.match(fn, /requireAnyStatusProfile\(\)/);
  assert.doesNotMatch(own, /fd\.get\("profile_id"\)|p_actor: (?!profile\.id)/);
  const auth = readFileSync(new URL("../auth.ts", import.meta.url), "utf8");
  assert.match(auth, /account_status !== "active"\) redirect\("\/verification"\)/);
});

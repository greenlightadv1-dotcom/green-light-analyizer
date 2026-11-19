// Isolated stack only. A short smoke pass over the registration and
// verification flow (migration 0039), through the real pages and routes:
//
//   Get Started → "check your email" → the emailed link verifies the address
//   → step-by-step creator application (each step saves only its own fields)
//   → public photo (image only) → review → submit → reviewer rejects with a
//   reason → the applicant asks for a new link and reads the decision.
//   Plus: a representative application cannot be submitted without ID images,
//   and an unverified email cannot be submitted.
//
// Not the full test phase: identity images are seeded as database rows (the
// camera itself is covered by the camera unit tests and was not driven here).
//
//   DB_URL=... MOCK_OUTBOX=<outbox the app writes> APP_URL=http://127.0.0.1:3200 \
//     node scripts/isolated-validation/registration-smoke.mjs
//
// Uses the ux-admin account from the README. It grants that account the
// reviewer role for the run and removes the grant and every row it created
// afterwards.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.APP_URL ?? "http://127.0.0.1:3200";
const OUTBOX = process.env.MOCK_OUTBOX;
const sql = (q) => execSync(`psql "$DB_URL" -XqAt -c "${q.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
const RUN = Date.now().toString(36);
const EMAIL = `smoke-${RUN}@example.invalid`;
const REP = `smoke-rep-${RUN}@example.invalid`;
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let n = 0;
const ok = (m) => console.log(`ok ${++n} - ${m}`);
const lastLink = (to, path) => {
  const lines = readFileSync(OUTBOX, "utf8").split("\n").filter((l) => l.includes(to));
  const m = [...lines.join("\n").matchAll(new RegExp(`https?://[^"\\\\\\s<>]+${path.replace("/", "\\/")}\\?token=[A-Za-z0-9_-]{40,}`, "g"))];
  return m.at(-1)?.[0].replace(/^https?:\/\/[^/]+/, BASE) ?? null;
};
const resetLimits = () => sql("delete from rate_limits where key like 'access_request%' or key like 'activation%' or key like 'application_write%' or key like 'upload%'");

const browser = await chromium.launch();
try {
  resetLimits();
  sql("insert into verification_reviewers (admin_id) select id from profiles where primary_email='ux-admin@example.invalid' on conflict do nothing");

  // --- 1. Get Started: an application, and "check your email" -------------------------
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/get-started/creator`, { waitUntil: "networkidle" });
  await p.fill('input[name="full_name"]', "Smoke Creator");
  await p.fill('input[name="email"]', EMAIL);
  await p.selectOption('select[name="primary_platform"]', "youtube");
  await p.fill('input[name="channel_handle"]', "@smoke");
  await p.locator('main form button[type="submit"]').click();
  await p.getByRole("status").filter({ hasText: /email/i }).first().waitFor();
  assert.ok(await p.getByRole("link", { name: /new link/i }).count(), "a way to ask for a new link");
  const req = sql(`select id || '|' || coalesce(email_verified_at::text, '') from access_requests where email='${EMAIL}'`).split("|");
  assert.equal(req[1], "", "not verified before the link is opened");
  ok("Get Started opens an application and says to check the email; the address is not verified yet");

  // --- 2. Submission refused while unverified (database guard) --------------------------
  const caseId = sql(`select id from verification_cases where access_request_id='${req[0]}'`);
  const refused = execSync(`psql "$DB_URL" -XqAt -c "select public.verification_transition(null, '${caseId}', 'submit')" 2>&1 || true`, { encoding: "utf8" });
  assert.match(refused, /verification:email_unverified|documents_missing/);
  ok("an unverified application cannot be submitted");

  // --- 3. The emailed link verifies the address ---------------------------------------
  const link = lastLink(EMAIL, "/apply/continue");
  assert.ok(link, "resume link emailed");
  await p.goto(link);
  await p.waitForURL(/\/apply$/);
  assert.notEqual(sql(`select coalesce(email_verified_at::text,'') from access_requests where id='${req[0]}'`), "");
  assert.equal(sql(`select count(*) from verification_events where case_id='${caseId}' and event='email_verified'`), "1");
  await p.getByText(/verified/i).first().waitFor();
  ok("opening the link records email verification (timestamp and history event) and the page shows it");

  // --- 4. Step by step; each step keeps the others ------------------------------------
  await p.getByRole("heading", { name: "Personal details" }).waitFor();
  await p.fill('input[name="legal_name"]', "Smoke Creator");
  await p.fill('input[name="date_of_birth"]', "1998-02-03");
  await p.fill('input[name="nationality"]', "EG");
  await p.fill('input[name="phone"]', "+20 101 234 5678");
  await p.getByRole("button", { name: "Save and continue" }).click();
  await p.getByRole("heading", { name: "Public profile" }).waitFor();
  await p.selectOption('select[name="main_platform"]', "youtube");
  await p.fill('input[name="handle"]', "@smoke");
  await p.locator('input[name="categories"][value="gaming"]').check();
  await p.locator('input[name="categories"][value="tech"]').check();
  await p.getByRole("button", { name: "Save and continue" }).click();
  await p.getByRole("heading", { name: "Identity photos" }).waitFor();
  const details = JSON.parse(sql(`select details from verification_cases where id='${caseId}'`));
  assert.deepEqual(details, { legal_name: "Smoke Creator", date_of_birth: "1998-02-03", nationality: "EG", phone: "+201012345678", main_platform: "youtube", handle: "@smoke", categories: "gaming,tech" });
  ok("two steps saved: the second kept the first's fields; the phone is stored normalised");

  // --- 5. Public photo: an image is accepted, a PDF is not -------------------------------
  const up = (bytes, type) => p.evaluate(async ({ caseId, bytes, type }) => {
    const body = new FormData();
    body.set("case_id", caseId);
    body.set("doc_type", "profile_photo");
    body.set("capture", "upload");
    body.set("file", new Blob([Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))], { type }), "x");
    const r = await fetch("/api/applications/documents", { method: "POST", body });
    return { status: r.status, body: await r.json() };
  }, { caseId, bytes, type });
  const pdf = await up(btoa("%PDF-1.4\n%smoke\n"), "application/pdf");
  assert.equal(pdf.status, 415);
  const png = await up(PNG, "image/png");
  assert.equal(png.status, 200, JSON.stringify(png.body));
  ok("the public photo accepts an image and refuses a PDF");

  // --- 6. Review: not ready without identity images; ready after -------------------------
  await p.reload();
  await p.getByRole("heading", { name: "Identity photos" }).waitFor();
  await p.getByRole("button", { name: /Review and submit/ }).click();
  await p.getByText(/still missing/i).first().waitFor();
  assert.equal(await p.getByRole("button", { name: "Submit for review" }).count(), 0);
  for (const d of ["selfie", "id_front", "id_back"]) {
    sql(`insert into verification_documents (case_id, doc_type, storage_path, mime, size_bytes, capture_method) values ('${caseId}', '${d}', '${caseId}/' || gen_random_uuid() || '.jpg', 'image/jpeg', 1000, 'camera')`);
  }
  await p.reload();
  await p.getByRole("heading", { name: "Review and submit" }).waitFor();
  await p.locator('input[name="consent"]').check();
  await p.getByRole("button", { name: "Submit for review" }).click();
  await p.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
  await p.getByText("Submitted for review").first().waitFor();
  assert.equal(sql(`select status from verification_cases where id='${caseId}'`), "submitted");
  ok("the review step blocks submission until everything is there, then submits once confirmed");

  // --- 7. Reviewer: trust checks, then reject with a reason -------------------------------
  const admin = await browser.newContext();
  const a = await admin.newPage();
  await a.goto(`${BASE}/login`);
  await a.fill('input[name="email"]', "ux-admin@example.invalid");
  await a.fill('input[name="password"]', "Ux-Admin-1234!");
  await Promise.all([a.waitForURL(/dashboard/), a.click('form button[type="submit"]')]);
  await a.goto(`${BASE}/admin/verification/${caseId}`);
  await a.getByText(/Email verified/).first().waitFor();
  await a.getByText(/has not been verified|not.*verified \(no OTP/i).first().waitFor();
  const rejectForm = a.locator("form").filter({ has: a.locator('input[name="action"][value="reject"]') });
  await rejectForm.locator('textarea[name="note"]').fill("The ID photo is unreadable. Please apply again.");
  await rejectForm.locator('button[type="button"], button[type="submit"]').first().click();
  await a.getByRole("dialog").getByRole("button", { name: /confirm/i }).click();
  await a.waitForFunction(() => document.body.innerText.toLowerCase().includes("not waiting for a decision"));
  assert.equal(sql(`select status from verification_cases where id='${caseId}'`), "rejected");
  ok("the reviewer sees the email-verified and unverified-phone checks, and rejects with a reason");

  // --- 8. The applicant reads the decision through a new link; nothing is editable ---------
  const later = await browser.newContext();
  const q = await later.newPage();
  await q.goto(`${BASE}/apply`);
  await q.fill('input[name="email"]', EMAIL);
  await q.getByRole("button", { name: /email me a link/i }).click();
  await q.getByRole("status").first().waitFor();
  const link2 = lastLink(EMAIL, "/apply/continue");
  assert.ok(link2 && link2 !== link, "a new link for the rejected application");
  await q.goto(link2);
  await q.getByText("The ID photo is unreadable. Please apply again.").waitFor();
  assert.equal(await q.locator('input[name="legal_name"]').count(), 0, "no editable fields");
  ok("a rejected applicant gets a new link, reads the reviewer's reason, and cannot edit");

  // --- 9. Representative: identity images are required ---------------------------------
  sql(`insert into access_requests (email_verified_at, journey, full_name, email, company_name) values (now(), 'company_representative', 'Smoke Rep', '${REP}', 'Some Co')`);
  const repCase = sql(`insert into verification_cases (access_request_id, kind, details) select id, 'representative', '{}' from access_requests where email='${REP}' returning id`).split("\n")[0];
  sql(`insert into verification_documents (case_id, doc_type, storage_path, mime, size_bytes) values ('${repCase}', 'authorization_letter', '${repCase}/' || gen_random_uuid() || '.pdf', 'application/pdf', 1000)`);
  const repRefused = execSync(`psql "$DB_URL" -XqAt -c "select public.verification_transition(null, '${repCase}', 'submit')" 2>&1 || true`, { encoding: "utf8" });
  assert.match(repRefused, /verification:documents_missing/);
  ok("a representative with only an authorization letter cannot submit (ID images required)");
} finally {
  sql(`delete from access_requests where email in ('${EMAIL}', '${REP}')`);
  sql("delete from verification_reviewers where admin_id = (select id from profiles where primary_email='ux-admin@example.invalid')");
  resetLimits();
  await browser.close();
}
console.log(`\n${n} checks passed`);

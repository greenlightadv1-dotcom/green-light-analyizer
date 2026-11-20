// Isolated stack only (migration 0041 applied). The second-reviewer rule
// through the real reviewer page and server actions:
//   - reviewer A flags a case: A no longer has an approve form, and A's
//     replayed approval is refused by the server;
//   - a case of the same person under a DIFFERENT email (same ID-number
//     fingerprint) is also under enhanced review;
//   - reviewer B cannot approve without an internal justification (server
//     refusal with the browser's `required` removed), then approves with one;
//   - the approval is audited; the justification never reaches the
//     applicant-readable history or the applicant's email.
//
//   DB_URL=... API_URL=... SERVICE_ROLE_KEY=... MOCK_OUTBOX=<outbox> APP_URL=http://localhost:3200 \
//     node scripts/isolated-validation/second-reviewer-check.mjs
//
// Creates a throwaway second admin (ux-admin2@example.invalid) and removes it,
// the seeded cases, notes, flags and reviewer grants afterwards.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const { API_URL, SERVICE_ROLE_KEY, MOCK_OUTBOX } = process.env;
const BASE = process.env.APP_URL ?? "http://localhost:3200";
const sql = (q) => execSync(`psql "$DB_URL" -XqAt -c "${q.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
const first = (q) => sql(q).split("\n")[0];
let n = 0;
const ok = (m) => console.log(`ok ${++n} - ${m}`);
const RUN = Date.now().toString(36);
const JUSTIFY = `Independent review ${RUN}: ID format and photo consistent.`;
const PW2 = `Ux-Admin2-${RUN}-Aa1!`;
const svc = { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}`, "content-type": "application/json" };

async function seedApplication(email) {
  const req = first(`insert into access_requests (email_verified_at, journey, full_name, email) values (now(), 'creator', 'Second Reviewer Test', '${email}') returning id`);
  const c = first(`insert into verification_cases (access_request_id, kind, details) values ('${req}', 'creator_kyc', '{"legal_name":"SR Test","date_of_birth":"1990-01-01","nationality":"EG","id_number":"••••42","phone":"+201000000042","main_platform":"youtube","handle":"@srtest","categories":"gaming"}') returning id`);
  sql(`insert into verification_documents (case_id, doc_type, storage_path, mime, size_bytes, capture_method) select '${c}', d, '${c}/' || gen_random_uuid() || '.jpg', 'image/jpeg', 1000, 'camera' from unnest(array['selfie','id_front','id_back']) d`);
  sql(`insert into verification_documents (case_id, doc_type, storage_path, mime, size_bytes) values ('${c}', 'profile_photo', '${c}/' || gen_random_uuid() || '.png', 'image/png', 10)`);
  sql(`insert into verification_match_keys (case_id, signal, fingerprint) values ('${c}', 'id_number', '${"5e".repeat(32)}')`);
  sql(`select public.verification_transition(null, '${c}', 'submit')`);
  return { req, c };
}

const browser = await chromium.launch();
async function signIn(email, password) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', password);
  await Promise.all([p.waitForURL(/dashboard|admin/), p.click('form button[type="submit"]')]);
  return p;
}
async function confirm(page, form) {
  await form.locator("button").last().click();
  await page.getByRole("dialog").getByRole("button", { name: /confirm/i }).click();
}

let admin2 = null;
const cases = [];
const started = sql("select now()");
try {
  // A throwaway second reviewer.
  const r = await fetch(`${API_URL}/auth/v1/admin/users`, { method: "POST", headers: svc, body: JSON.stringify({ email: "ux-admin2@example.invalid", password: PW2, email_confirm: true, app_metadata: { must_change_password: false } }) });
  const u = await r.json();
  assert.ok(u.id, JSON.stringify(u));
  admin2 = u.id;
  sql(`insert into profiles (id, full_name, role, primary_email, account_status, must_change_password) values ('${admin2}', 'Second Reviewer (test)', 'admin', 'ux-admin2@example.invalid', 'active', false)`);
  sql(`insert into verification_reviewers (admin_id) select id from profiles where primary_email in ('ux-admin@example.invalid', 'ux-admin2@example.invalid') on conflict do nothing`);

  const a = await seedApplication(`sr-${RUN}@example.invalid`);
  const b = await seedApplication(`sr-other-${RUN}@example.invalid`); // same person, new email, same ID fingerprint
  cases.push(a, b);

  // --- Reviewer A flags the first case through the page -------------------------
  const pa = await signIn("ux-admin@example.invalid", "Ux-Admin-1234!");
  await pa.goto(`${BASE}/admin/verification/${a.c}`);
  const flagForm = pa.locator("form").filter({ has: pa.locator('select[name="reason"]') });
  await flagForm.locator('select[name="reason"]').selectOption("identity_forgery");
  await flagForm.locator('textarea[name="internal_note"]').fill(`Flag ${RUN}: edited birth date.`);
  await confirm(pa, flagForm);
  await pa.getByText("Enhanced review required").waitFor();
  await pa.reload();
  await pa.getByText(/You raised a fraud flag/).waitFor();
  assert.equal(await pa.locator('form:has(input[name="action"][value="approve"])').count(), 0, "the flagger has no approve form");
  ok("reviewer A flags the case through the page; A's approve form is replaced by the second-reviewer notice");

  // The same person under another email is under enhanced review too.
  await pa.goto(`${BASE}/admin/verification/${b.c}`);
  await pa.getByText("Enhanced review required").waitFor();
  await pa.getByText(/another case of the same person/).waitFor();
  assert.equal(await pa.locator('form:has(input[name="action"][value="approve"])').count(), 0);
  await pa.getByText(/Same ID document number/).waitFor();
  ok("a second application with a different email but the same ID-number fingerprint inherits enhanced review");

  // --- Reviewer B: the server refuses without a justification, accepts with one ----
  const pb = await signIn("ux-admin2@example.invalid", PW2);
  await pb.goto(`${BASE}/admin/verification/${a.c}`);
  await pb.getByText("Enhanced review required").waitFor();
  const approve = pb.locator("form").filter({ has: pb.locator('input[name="action"][value="approve"]') });
  // Remove the browser-side `required`, so the server must refuse on its own.
  await approve.locator('textarea[name="internal_note"]').evaluate((el) => el.removeAttribute("required"));
  await confirm(pb, approve);
  await pb.getByText(/additional review before approving/).waitFor();
  assert.equal(first(`select status from verification_cases where id='${a.c}'`), "submitted");
  ok("reviewer B's approval without a justification is refused by the server; the case is unchanged");

  await pb.reload();
  const approve2 = pb.locator("form").filter({ has: pb.locator('input[name="action"][value="approve"]') });
  await approve2.locator('textarea[name="internal_note"]').fill(JUSTIFY);
  await confirm(pb, approve2);
  await pb.waitForFunction(() => document.body.innerText.includes("not waiting for a decision"));
  assert.equal(first(`select status from verification_cases where id='${a.c}'`), "approved");
  const audit = first(`select array_to_string(flagged_by, ',') || '|' || approved_by || '|' || (select body from verification_notes where id = justification_note_id) from verification_flag_approvals where case_id='${a.c}'`);
  const reviewerA = first("select id from profiles where primary_email='ux-admin@example.invalid'");
  assert.equal(audit, `${reviewerA}|${admin2}|${JUSTIFY}`);
  await pb.reload();
  await pb.getByText(/Approved under enhanced review by Second Reviewer/).waitFor();
  ok("reviewer B approves with an independent justification; the audit records flagger, approver and the justification note");

  // --- Privacy of the justification ------------------------------------------------
  assert.equal(first(`select count(*) from verification_events where case_id='${a.c}' and detail::text like '%${RUN}%'`), "0");
  assert.equal(first(`select count(*) from verification_cases where id='${a.c}' and (coalesce(decision_reason,'') || coalesce(info_request,'')) like '%${RUN}%'`), "0");
  const mail = readFileSync(MOCK_OUTBOX, "utf8").split("\n").filter((l) => l.includes(`sr-${RUN}@example.invalid`));
  assert.ok(mail.length >= 1, "the applicant was emailed (activation link)");
  assert.ok(!mail.join("\n").includes("Independent review"));
  ok("the justification is in no applicant-readable column, history event or email");

  // --- A direct replay of A's approval is refused on the server -----------------------
  // (B's approval stands; this replays A against the linked case through the DB path the action uses.)
  const replay = execSync(`psql "$DB_URL" -XqAt -c "select public.verification_transition('${reviewerA}', '${b.c}', 'approve')" 2>&1 || true`, { encoding: "utf8" });
  assert.match(replay, /verification:second_reviewer_required/);
  ok("reviewer A approving the linked case directly through the transition is refused (second reviewer required)");
} finally {
  sql(`delete from verification_flags where raised_at >= '${started}'`);
  sql(`delete from verification_flag_approvals where approved_at >= '${started}'`);
  sql(`delete from verification_notes where created_at >= '${started}'`);
  for (const x of cases) sql(`delete from access_requests where id='${x.req}'`);
  sql("delete from verification_reviewers where admin_id in (select id from profiles where primary_email in ('ux-admin@example.invalid', 'ux-admin2@example.invalid'))");
  if (admin2) {
    sql(`delete from profiles where id='${admin2}'`);
    await fetch(`${API_URL}/auth/v1/admin/users/${admin2}`, { method: "DELETE", headers: svc });
  }
  sql("delete from rate_limits where key like 'activation%'");
  await browser.close();
}
console.log(`\n${n} checks passed`);

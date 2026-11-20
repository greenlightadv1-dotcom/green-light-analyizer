// Isolated stack only (migration 0041 applied). Closes the one gap left by
// second-reviewer-check.mjs: the reviewer who raised a fraud flag is refused
// by the ACTUAL approval Server Action, reviewVerification
// (src/app/(app)/admin/verification/actions.ts), not only by the database
// function.
//
// How the flagger reaches the action: the approve form is hidden from them,
// but their page still has the request-information form, which posts to the
// same Server Action. The test submits that real form from the flagger's own
// signed-in browser and rewrites only its `action` field to "approve" in
// transit, adding an internal justification. That is exactly what a tampered
// browser could send. The reviewer's identity is never in the request: the
// action takes it from the session cookie (requireReviewer()).
//
//   DB_URL=... API_URL=... SERVICE_ROLE_KEY=... MOCK_OUTBOX=<outbox> APP_URL=http://localhost:3200 \
//     node scripts/isolated-validation/second-reviewer-action-check.mjs
//
// Creates a throwaway second admin (ux-admin2@example.invalid) and removes it,
// the seeded applications, notes, flags and reviewer grants afterwards.
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
const PW2 = `Ux-Admin2-${RUN}-Aa1!`;
const svc = { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}`, "content-type": "application/json" };
const mailsTo = (email) => readFileSync(MOCK_OUTBOX, "utf8").split("\n").filter((l) => l.includes(email)).length;

async function seedApplication(email, who = { name: "Action Check", dob: "1991-01-01", phone: "+201000000077" }) {
  const req = first(`insert into access_requests (email_verified_at, journey, full_name, email) values (now(), 'creator', 'Action Check', '${email}') returning id`);
  const c = first(`insert into verification_cases (access_request_id, kind, details) values ('${req}', 'creator_kyc', '{"legal_name":"${who.name}","date_of_birth":"${who.dob}","nationality":"EG","id_number":"••••77","phone":"${who.phone}","main_platform":"youtube","handle":"@actioncheck","categories":"gaming"}') returning id`);
  sql(`insert into verification_documents (case_id, doc_type, storage_path, mime, size_bytes, capture_method) select '${c}', d, '${c}/' || gen_random_uuid() || '.jpg', 'image/jpeg', 1000, 'camera' from unnest(array['selfie','id_front','id_back']) d`);
  sql(`insert into verification_documents (case_id, doc_type, storage_path, mime, size_bytes) values ('${c}', 'profile_photo', '${c}/' || gen_random_uuid() || '.png', 'image/png', 10)`);
  sql(`select public.verification_transition(null, '${c}', 'submit')`);
  return { req, c, email };
}
// Everything an applicant could observe, plus the audit, for one case.
const snapshot = (x) => ({
  status: first(`select status from verification_cases where id='${x.c}'`),
  reviewedBy: first(`select coalesce(reviewed_by::text, '') from verification_cases where id='${x.c}'`),
  applicantText: first(`select coalesce(decision_reason, '') || '|' || coalesce(info_request, '') from verification_cases where id='${x.c}'`),
  events: first(`select count(*) from verification_events where case_id='${x.c}'`),
  audits: first(`select count(*) from verification_flag_approvals where case_id='${x.c}'`),
  notes: first(`select count(*) from verification_notes where case_id='${x.c}'`),
  account: first(`select coalesce(created_profile_id::text, '') || '|' || status from access_requests where id='${x.req}'`),
  activationTokens: first(`select count(*) from application_tokens where access_request_id='${x.req}' and purpose='activation'`),
  mails: mailsTo(x.email),
});

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
const formFor = (page, action) => page.locator("form").filter({ has: page.locator(`input[name="action"][value="${action}"]`) });
async function submit(page, form) {
  await form.locator("button").last().click();
  await page.getByRole("dialog").getByRole("button", { name: /confirm/i }).click();
}

let admin2 = null;
const apps = [];
const started = first("select now()");
try {
  // Two reviewers: A (ux-admin) raises the flag; B (throwaway) is independent.
  const r = await fetch(`${API_URL}/auth/v1/admin/users`, { method: "POST", headers: svc, body: JSON.stringify({ email: "ux-admin2@example.invalid", password: PW2, email_confirm: true, app_metadata: { must_change_password: false } }) });
  const u = await r.json();
  assert.ok(u.id, JSON.stringify(u));
  admin2 = u.id;
  sql(`insert into profiles (id, full_name, role, primary_email, account_status, must_change_password) values ('${admin2}', 'Reviewer B (test)', 'admin', 'ux-admin2@example.invalid', 'active', false)`);
  sql("insert into verification_reviewers (admin_id) select id from profiles where primary_email in ('ux-admin@example.invalid', 'ux-admin2@example.invalid') on conflict do nothing");
  const reviewerA = first("select id from profiles where primary_email='ux-admin@example.invalid'");

  const flagged = await seedApplication(`act-${RUN}@example.invalid`);
  const regress = await seedApplication(`act-regress-${RUN}@example.invalid`);
  // A different person: the reviewer page fingerprints name + date of birth, and
  // sharing them with the flagged applicant would (correctly) inherit enhanced review.
  const plain = await seedApplication(`act-plain-${RUN}@example.invalid`, { name: "Unrelated Person", dob: "1985-05-05", phone: "+201000000088" });
  apps.push(flagged, regress, plain);
  for (const x of [flagged, regress]) sql(`select public.verification_flag('${reviewerA}', '${x.c}', 'identity_forgery', 'Flag ${RUN}: inconsistent ID font.')`);

  // --- 1–8. The flagger, through the real Server Action ---------------------------------
  const pa = await signIn("ux-admin@example.invalid", "Ux-Admin-1234!");
  await pa.goto(`${BASE}/admin/verification/${flagged.c}`);
  await pa.getByText(/You raised a fraud flag/).waitFor();
  assert.equal(await formFor(pa, "approve").count(), 0, "no approve form for the flagger");

  const before = snapshot(flagged);
  let actionRequest = null;
  let actionResponse = null;
  await pa.route(`${BASE}/admin/verification/${flagged.c}`, async (route) => {
    const req = route.request();
    if (req.method() !== "POST" || !req.headers()["next-action"]) return route.continue();
    const body = req.postData() ?? "";
    // Only the action field changes; case id and every other field are the page's own.
    const tampered = body.replace(/(name="[^"]*action"\r\n\r\n)request_info(\r\n)/, "$1approve$2");
    assert.notEqual(tampered, body, "the action field was found and rewritten");
    assert.ok(!/reviewer|admin_id|actor|p_actor/i.test(tampered.replace(/name="[^"]*"/g, "")), "no reviewer identity is sent by the browser");
    actionRequest = { headers: req.headers(), body: tampered };
    await route.continue({ postData: tampered });
  });
  pa.on("response", (res) => {
    if (res.request().method() === "POST" && res.request().headers()["next-action"]) actionResponse = res.status();
  });
  const info = formFor(pa, "request_info");
  await info.locator('textarea[name="note"]').fill("Applicant-facing text that must not be stored.");
  await info.locator('textarea[name="internal_note"]').fill(`Flagger's own justification ${RUN}.`);
  await submit(pa, info);
  await pa.getByText(/needs approval by a second reviewer who did not raise its fraud flag/).waitFor();
  assert.ok(actionRequest, "the real Server Action request was sent");
  assert.match(actionRequest.headers["next-action"], /^[0-9a-f]{40,}$/i, "a Next.js Server Action id");
  assert.equal(actionResponse, 200, "the action ran and answered (a refusal result, not a transport error)");
  ok(`flagger A, signed in, posted action=approve to the real reviewVerification Server Action (id ${actionRequest.headers["next-action"].slice(0, 12)}…) with a justification; the action refused: "second reviewer required"`);

  const after = snapshot(flagged);
  assert.deepEqual(after, before, "nothing changed");
  assert.equal(after.status, "submitted");
  assert.equal(after.audits, "0");
  ok("after the refusal: status still submitted, reviewed_by unset, no approval audit row, no internal note written (the check runs before any write)");
  ok(`no applicant-visible change: same history (${after.events} events), no decision or request text, no activation link, no account, no email (${after.mails} before and after)`);
  await pa.unroute(`${BASE}/admin/verification/${flagged.c}`);

  // --- 9–11. Reviewer B: refused without a justification, approved with one -------------
  const pb = await signIn("ux-admin2@example.invalid", PW2);
  await pb.goto(`${BASE}/admin/verification/${flagged.c}`);
  let approve = formFor(pb, "approve");
  await approve.locator('textarea[name="internal_note"]').evaluate((el) => el.removeAttribute("required"));
  await submit(pb, approve);
  await pb.getByText(/additional review before approving/).waitFor();
  assert.deepEqual(snapshot(flagged), before, "still nothing changed");
  ok("reviewer B without a justification is refused by the same Server Action; nothing changes");

  await pb.reload();
  approve = formFor(pb, "approve");
  const JUSTIFY = `Independent review ${RUN}: format and photo consistent.`;
  await approve.locator('textarea[name="internal_note"]').fill(JUSTIFY);
  await submit(pb, approve);
  await pb.waitForFunction(() => document.body.innerText.includes("not waiting for a decision"));
  const done = snapshot(flagged);
  assert.equal(done.status, "approved");
  assert.equal(done.reviewedBy, admin2, "reviewed_by is B, from B's session");
  const audit = first(`select array_to_string(flagged_by, ',') || '|' || approved_by || '|' || (select body from verification_notes where id = justification_note_id) || '|' || (select author_id from verification_notes where id = justification_note_id) from verification_flag_approvals where case_id='${flagged.c}'`);
  assert.equal(audit, `${reviewerA}|${admin2}|${JUSTIFY}|${admin2}`);
  assert.equal(done.audits, "1");
  assert.equal(first(`select count(*) from verification_events where case_id='${flagged.c}' and detail::text like '%${RUN}%'`), "0");
  assert.ok(done.mails > before.mails, "the applicant got the ordinary activation email");
  assert.ok(!readFileSync(MOCK_OUTBOX, "utf8").split("\n").filter((l) => l.includes(flagged.email)).join("\n").includes("Independent review"), "no justification in the email");
  ok("reviewer B approves with an independent justification: approved, reviewed_by = B, audit row = flagger A / approver B / B's own justification note; the justification is in no history event or email");

  // --- Regression: the flagger can still request information and reject ---------------
  await pa.goto(`${BASE}/admin/verification/${regress.c}`);
  const mailsBefore = mailsTo(regress.email);
  const req2 = formFor(pa, "request_info");
  await req2.locator('textarea[name="note"]').fill("Please retake the back of your ID.");
  await submit(pa, req2);
  await pa.getByText(/not waiting for a decision/).waitFor();
  assert.equal(first(`select status || '|' || info_request from verification_cases where id='${regress.c}'`), "needs_info|Please retake the back of your ID.");
  assert.ok(mailsTo(regress.email) > mailsBefore, "the applicant was emailed the request");
  sql(`select public.verification_transition(null, '${regress.c}', 'submit')`);
  await pa.goto(`${BASE}/admin/verification/${regress.c}`);
  const rej = formFor(pa, "reject");
  await rej.locator('textarea[name="note"]').fill("We could not verify your identity document.");
  await submit(pa, rej);
  await pa.getByText(/not waiting for a decision/).waitFor();
  assert.equal(first(`select status || '|' || decision_reason from verification_cases where id='${regress.c}'`), "rejected|We could not verify your identity document.");
  assert.equal(first(`select status from access_requests where id='${regress.req}'`), "rejected");
  assert.equal(first(`select count(*) from verification_flag_approvals where case_id='${regress.c}'`), "0");
  ok("regression: the flagging reviewer can still request information (case needs_info, applicant emailed) and reject (case and application rejected), with no second reviewer");

  // --- Regression: an unflagged case is still approved by a single reviewer -----------
  await pa.goto(`${BASE}/admin/verification/${plain.c}`);
  await formFor(pa, "approve").waitFor();
  await submit(pa, formFor(pa, "approve"));
  await pa.getByText(/not waiting for a decision/).waitFor();
  assert.equal(first(`select status from verification_cases where id='${plain.c}'`), "approved");
  assert.equal(first(`select count(*) from verification_flag_approvals where case_id='${plain.c}'`), "0");
  ok("regression: an unflagged case is approved by one reviewer, without a justification and without an enhanced-review audit row");
} finally {
  sql(`delete from verification_flags where raised_at >= '${started}'`);
  sql(`delete from verification_flag_approvals where approved_at >= '${started}'`);
  sql(`delete from verification_notes where created_at >= '${started}'`);
  for (const x of apps) sql(`delete from access_requests where id='${x.req}'`);
  sql("delete from verification_reviewers where admin_id in (select id from profiles where primary_email in ('ux-admin@example.invalid', 'ux-admin2@example.invalid'))");
  if (admin2) {
    sql(`delete from profiles where id='${admin2}'`);
    await fetch(`${API_URL}/auth/v1/admin/users/${admin2}`, { method: "DELETE", headers: svc });
  }
  sql("delete from rate_limits where key like 'activation%'");
  await browser.close();
}
console.log(`\n${n} checks passed`);

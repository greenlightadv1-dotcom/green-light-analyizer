// Isolated stack only (migration 0040 applied). Checks, against the real
// services rather than fakes:
//   1. retention: the scheduled route deletes a stored document only once its
//      case was decided more than 365 days ago, keeps a recent one, records
//      the purge, refuses a caller without the cron secret, and a second run
//      does nothing;
//   2. internal notes and flags through the real PostgREST API: a reviewer
//      reads them, the case's subject and a non-reviewer admin do not, and
//      nobody can insert one directly;
//   3. EXIF/GPS: a JPEG carrying GPS, camera make/model and a comment,
//      uploaded through the real avatar route, is public without any of it.
//
//   DB_URL=... API_URL=... ANON_KEY=... SERVICE_ROLE_KEY=... CRON_SECRET=<the app's>
//   FIXTURE=<jpeg with GPS> APP_URL=http://localhost:3200 \
//     node scripts/isolated-validation/review-retention-check.mjs
//
// Uses the ux-* accounts from the README; grants ux-admin the reviewer role for
// the run and removes every row, object and grant it created afterwards.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, CRON_SECRET, FIXTURE } = process.env;
const BASE = process.env.APP_URL ?? "http://localhost:3200";
const sql = (q) => execSync(`psql "$DB_URL" -XqAt -c "${q.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
const svc = { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}` };
let n = 0;
const ok = (m) => console.log(`ok ${++n} - ${m}`);

const put = (path, bytes) =>
  fetch(`${API_URL}/storage/v1/object/verification-docs/${path}`, { method: "POST", headers: { ...svc, "content-type": "image/jpeg" }, body: bytes });
const exists = async (path) => (await fetch(`${API_URL}/storage/v1/object/verification-docs/${path}`, { headers: svc })).status === 200;
async function jwt(email, password) {
  const r = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  const j = await r.json();
  assert.ok(j.access_token, `sign-in ${email}`);
  return j.access_token;
}
const rest = (token, path, init = {}) => fetch(`${API_URL}/rest/v1/${path}`, { ...init, headers: { apikey: ANON_KEY, authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) } });

const RUN = Date.now().toString(36);
const created = { requests: [], cases: [], paths: [] };
const browser = await chromium.launch();
const started = sql("select now()");
const original = sql("select coalesce(avatar_url,'') from profiles where primary_email='ux-creator@example.invalid'");
try {
  sql("insert into verification_reviewers (admin_id) select id from profiles where primary_email='ux-admin@example.invalid' on conflict do nothing");

  // --- 1. Retention ---------------------------------------------------------------
  const mk = (label, interval) => {
    const req = sql(`insert into access_requests (journey, full_name, email, status) values ('creator', 'Retention ${label}', 'ret-${label}-${RUN}@example.invalid', 'approved') returning id`).split("\n")[0];
    const c = sql(`insert into verification_cases (access_request_id, kind, status, reviewed_at) values ('${req}', 'creator_kyc', 'approved', now() - interval '${interval}') returning id`).split("\n")[0];
    created.requests.push(req);
    created.cases.push(c);
    return c;
  };
  const oldCase = mk("old", "366 days");
  const recentCase = mk("recent", "300 days");
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const docs = {};
  for (const [label, c] of [["old", oldCase], ["recent", recentCase]]) {
    const path = `${c}/${randomUUID()}.jpg`;
    assert.equal((await put(path, jpeg)).status, 200, `upload ${label}`);
    created.paths.push(path);
    docs[label] = { path, id: sql(`insert into verification_documents (case_id, doc_type, storage_path, mime, size_bytes, capture_method) values ('${c}', 'selfie', '${path}', 'image/jpeg', 4, 'camera') returning id`).split("\n")[0] };
  }
  assert.ok((await exists(docs.old.path)) && (await exists(docs.recent.path)));

  const cron = (secret) => fetch(`${BASE}/api/cron/verification-retention`, { headers: secret ? { authorization: `Bearer ${secret}` } : {} });
  assert.equal((await cron(null)).status, 401);
  assert.equal((await cron("wrong-secret-wrong-secret")).status, 401);
  const run = await cron(CRON_SECRET);
  const body = await run.json();
  assert.equal(run.status, 200, JSON.stringify(body));
  assert.equal(body.days, 365);
  assert.ok(body.deleted >= 1 && body.failed === 0, JSON.stringify(body));
  assert.equal(await exists(docs.old.path), false, "the 366-day-old file is deleted from storage");
  assert.equal(await exists(docs.recent.path), true, "the 300-day-old file is kept");
  assert.equal(sql(`select (purged_at is not null)::text || (purge_confirmed_at is not null)::text || (removed_at is not null)::text from verification_documents where id='${docs.old.id}'`), "truetruetrue");
  assert.equal(sql(`select coalesce(purged_at::text,'none') from verification_documents where id='${docs.recent.id}'`), "none");
  assert.equal(sql(`select count(*) from verification_events where case_id='${oldCase}' and event='document_purged' and detail->>'retention_days'='365'`), "1");
  assert.equal(sql(`select count(*) from verification_events where case_id='${oldCase}' and detail::text like '%${docs.old.path}%'`), "0", "the audit record holds no file name or contents");
  const again = await (await cron(CRON_SECRET)).json();
  assert.equal(sql(`select count(*) from verification_events where case_id='${oldCase}' and event='document_purged'`), "1", "a second run purges nothing twice");
  assert.equal(again.failed, 0);
  // The database refuses an early purge even from the service role.
  const early = execSync(`psql "$DB_URL" -XqAt -c "update verification_documents set purged_at = now() where id = '${docs.recent.id}'" 2>&1 || true`, { encoding: "utf8" });
  assert.match(early, /retention:not_due/);
  ok("retention: unauthorized calls refused; the 366-day-old file deleted from real storage, the 300-day-old kept; audited once; an early purge refused by the database");

  // --- 2. Internal notes and flags through PostgREST -------------------------------
  const subjectId = sql("select id from profiles where primary_email='ux-creator@example.invalid'");
  let subjectCase = sql(`select id from verification_cases where profile_id='${subjectId}' and status <> 'rejected' limit 1`);
  if (!subjectCase) {
    subjectCase = sql(`insert into verification_cases (profile_id, kind) values ('${subjectId}', 'creator_kyc') returning id`).split("\n")[0];
    created.cases.push(subjectCase);
  }
  const reviewerId = sql("select id from profiles where primary_email='ux-admin@example.invalid'");
  sql(`select public.verification_add_note('${reviewerId}', '${subjectCase}', 'Internal ${RUN}: signature differs from the ID sample.')`);
  sql(`select public.verification_flag('${reviewerId}', '${subjectCase}', 'impersonation', 'Flag ${RUN}: handle belongs to someone else.')`);
  const creatorJwt = await jwt("ux-creator@example.invalid", "Ux-Creator-1234!");
  const companyJwt = await jwt("ux-company@example.invalid", "Ux-Company-1234!");
  const adminJwt = await jwt("ux-admin@example.invalid", "Ux-Admin-1234!");
  const read = async (token, table) => {
    const r = await rest(token, `${table}?select=*&case_id=eq.${subjectCase}`);
    return { status: r.status, rows: r.status === 200 ? await r.json() : [] };
  };
  for (const table of ["verification_notes", "verification_flags"]) {
    const subject = await read(creatorJwt, table);
    assert.equal(subject.rows.length, 0, `the subject reads ${table}`);
    assert.equal((await read(companyJwt, table)).rows.length, 0, `a company reads ${table}`);
    assert.ok((await read(adminJwt, table)).rows.length >= 1, `the reviewer reads ${table}`);
  }
  // The subject still reads their own case, which carries no internal text.
  const ownCase = await (await rest(creatorJwt, `verification_cases?select=*&id=eq.${subjectCase}`)).json();
  assert.equal(ownCase.length, 1);
  assert.ok(!JSON.stringify(ownCase).includes(RUN), "no internal text on the applicant-readable case row");
  const ownEvents = await (await rest(creatorJwt, `verification_events?select=*&case_id=eq.${subjectCase}`)).json();
  assert.ok(!JSON.stringify(ownEvents).includes(RUN), "no internal text in the applicant-readable history");
  // Nobody inserts directly, the reviewer included.
  for (const token of [creatorJwt, adminJwt]) {
    const ins = await rest(token, "verification_notes", { method: "POST", body: JSON.stringify({ case_id: subjectCase, body: "x" }) });
    assert.ok(ins.status === 401 || ins.status === 403, `insert answered ${ins.status}`);
    const rpc = await rest(token, "rpc/verification_add_note", { method: "POST", body: JSON.stringify({ p_actor: reviewerId, p_case: subjectCase, p_body: "x" }) });
    assert.ok(rpc.status === 401 || rpc.status === 403 || rpc.status === 404, `rpc answered ${rpc.status}`);
  }
  ok("internal notes and flags: the reviewer reads them; the subject, a company and direct inserts or RPC calls get nothing");

  // --- 3. EXIF/GPS through the real avatar route -------------------------------------
  const fixture = readFileSync(FIXTURE);
  for (const s of ["Cairo", "CameraMaker", "PhoneModel", "secret note"]) assert.ok(fixture.includes(Buffer.from(s)), `fixture carries ${s}`);
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  await p.fill('input[name="email"]', "ux-creator@example.invalid");
  await p.fill('input[name="password"]', "Ux-Creator-1234!");
  await Promise.all([p.waitForURL(/dashboard|verification/), p.click('form button[type="submit"]')]);
  const up = await p.evaluate(async (b64) => {
    const body = new FormData();
    body.set("file", new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: "image/jpeg" }), "phone.jpg");
    const r = await fetch("/api/uploads/avatar", { method: "POST", body });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, fixture.toString("base64"));
  if (up.status === 403) throw new Error("ux-creator is not active on this stack; the avatar route needs an active session");
  assert.equal(up.status, 200, JSON.stringify(up.body));
  const publicUrl = up.body.url.replace(/^https?:\/\/[^/]+/, API_URL);
  const served = Buffer.from(await (await fetch(publicUrl)).arrayBuffer());
  assert.equal(served[0], 0xff);
  assert.equal(served[1], 0xd8);
  for (const s of ["Cairo", "CameraMaker", "PhoneModel", "secret note", "GPS"]) assert.ok(!served.includes(Buffer.from(s)), `public file still carries ${s}`);
  ok(`EXIF/GPS: the public avatar has no GPS, make, model or comment (${fixture.length} → ${served.length} bytes)`);
  // For an independent reader (Pillow) to inspect the exact public bytes.
  if (process.env.OUT) writeFileSync(process.env.OUT, served);
} finally {
  for (const path of created.paths) await fetch(`${API_URL}/storage/v1/object/verification-docs/${path}`, { method: "DELETE", headers: svc }).catch(() => {});
  // The superuser connection removes the run's notes and flags (no API can).
  sql(`delete from verification_flags where raised_at >= '${started}'`);
  sql(`delete from verification_notes where created_at >= '${started}'`);
  if (created.cases.length) sql(`delete from verification_cases where id in (${created.cases.map((c) => `'${c}'`).join(",")})`);
  if (created.requests.length) sql(`delete from access_requests where id in (${created.requests.map((c) => `'${c}'`).join(",")})`);
  sql(`update profiles set avatar_url = ${original ? `'${original}'` : "null"} where primary_email='ux-creator@example.invalid'`);
  sql("delete from verification_reviewers where admin_id = (select id from profiles where primary_email='ux-admin@example.invalid')");
  sql("delete from rate_limits where key like 'upload%'");
  await browser.close();
}
console.log(`\n${n} checks passed`);

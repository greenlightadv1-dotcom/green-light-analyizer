// Isolated workflow test, part 3: submit -> reviewer gate -> approval -> activation -> sign-in.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const BASE = "http://localhost:3200", DB = process.env.DB_URL, OUT = process.env.MOCK_OUTBOX;
const sql = (q) => execFileSync("psql", [DB, "-XqAt", "-c", q]).toString().trim();
const outbox = () => readFileSync(OUT, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const ok = (name, cond, detail = "") => console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
const { link, caseId } = JSON.parse(readFileSync(process.env.STATE, "utf8"));
const browser = await chromium.launch();
async function confirmIn(page, trigger, confirmText) {
  await page.getByRole("button", { name: trigger, exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: confirmText, exact: true }).click();
  await page.waitForTimeout(2000);
}
// Submit for review (applicant).
const a = await browser.newContext(); const ap = await a.newPage();
await ap.goto(link.replace("127.0.0.1", "localhost")); await ap.waitForLoadState("networkidle");
await ap.check('input[name="consent"]');
await confirmIn(ap, "Submit for review", "Submit");
ok("application submitted for review", sql(`select status from public.verification_cases where id='${caseId}'`) === "submitted", sql(`select status from public.verification_cases where id='${caseId}'`));
async function login(email) {
  const c = await browser.newContext(); const p = await c.newPage();
  await p.goto(BASE + "/login"); await p.fill('input[name="email"]', email); await p.fill('input[name="password"]', "Test-Pass-12345!");
  await p.click('form button[type="submit"]'); await p.waitForTimeout(2500); return p;
}
// An admin who is not a reviewer cannot see or decide the case.
const other = await login("u-c92cd712@example.invalid");
await other.goto(BASE + "/admin/verification/" + caseId); await other.waitForLoadState("networkidle");
const otherHasApprove = await other.getByRole("button", { name: "Approve", exact: true }).count();
ok("non-reviewer admin has no Approve control", otherHasApprove === 0, other.url());
// The listed reviewer approves.
sql("insert into public.verification_reviewers (admin_id) values ('51fa9057-27ae-4856-91b5-38a225903cb5') on conflict do nothing");
const rev = await login("u-51fa9057@example.invalid");
ok("existing admin signs in through the app", !rev.url().includes("/login"), rev.url());
await rev.goto(BASE + "/admin/verification/" + caseId); await rev.waitForLoadState("networkidle");
const mailsBefore = outbox().filter((m) => m.host === "api.resend.com").length;
await confirmIn(rev, "Approve", "Confirm");
const st = sql(`select c.status||'|'||coalesce(c.profile_id::text,'NULL')||'|'||r.status from public.verification_cases c join public.access_requests r on r.id=c.access_request_id where c.id='${caseId}'`);
ok("reviewer approval recorded; still no account", /^approved\|NULL\|/.test(st), st);
const mails = outbox().filter((m) => m.host === "api.resend.com");
const act = JSON.stringify(mails.at(-1)?.body ?? {}).match(/https?:\/\/[^"\\\s<>]+\/activate\?token=[A-Za-z0-9_-]+/)?.[0];
ok("activation email captured by mock (not sent)", mails.length > mailsBefore && !!act, `${mails.length - mailsBefore} new mock email(s)`);
// Activation creates the account (with Auth sign-up disabled).
const usersBefore = Number(sql("select count(*) from auth.users"));
const ac = await browser.newContext(); const actp = await ac.newPage();
await actp.goto(act.replace("127.0.0.1", "localhost")); await actp.waitForLoadState("networkidle");
await actp.fill('input[name="password"]', "Activated-Pass-123!"); await actp.fill('input[name="confirm"]', "Activated-Pass-123!"); await actp.check('input[name="terms"]');
await actp.click('form button[type="submit"]'); await actp.waitForTimeout(4000);
const prof = sql(`select p.role||'|'||p.account_status||'|'||(p.id=r.created_profile_id)::text||'|'||r.status from public.profiles p join public.access_requests r on r.email=p.primary_email where r.email='applicant@example.invalid'`);
ok("activation created the account via the server (sign-up disabled)", Number(sql("select count(*) from auth.users")) === usersBefore + 1 && /^company\|active\|true\|approved$/.test(prof), `users ${usersBefore} -> ${sql("select count(*) from auth.users")}; profile ${prof}`);
ok("activated user is signed in", !actp.url().includes("/activate") && !actp.url().includes("/login"), actp.url());
ok("case linked to the new profile", sql(`select (profile_id is not null)::text from public.verification_cases where id='${caseId}'`) === "true");
// Replay of the same link is refused and creates nothing.
const rc = await browser.newContext(); const rp = await rc.newPage();
await rp.goto(act.replace("127.0.0.1", "localhost")); await rp.waitForLoadState("networkidle");
const replayText = (await rp.textContent("body")).replace(/\s+/g, " ");
const hasForm = await rp.$('input[name="password"]');
ok("activation link cannot be reused", !hasForm || /used|expired|invalid|no longer/i.test(replayText), (replayText.match(/[^.]*(used|expired|invalid|no longer)[^.]*\./i) || [""])[0].slice(0, 120));
ok("no extra account from the replay", Number(sql("select count(*) from auth.users")) === usersBefore + 1);
// The new account signs in normally afterwards.
const nc = await browser.newContext(); const np = await nc.newPage();
await np.goto(BASE + "/login"); await np.fill('input[name="email"]', "applicant@example.invalid"); await np.fill('input[name="password"]', "Activated-Pass-123!");
await np.click('form button[type="submit"]'); await np.waitForTimeout(2500);
ok("activated account signs in again", !np.url().includes("/login"), np.url());
await browser.close();

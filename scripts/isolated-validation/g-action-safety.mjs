// Isolated stack only. G action-safety gaps not covered by g-actions.mjs
// (Phase 1F), in a real browser with the AI DOWN (rules-only proposals):
//   - a STALE proposal: the brief is archived between G preparing the
//     invitation and the user confirming it; the server refuses, nothing is
//     created, and the user sees an error, not a success;
//   - a CROSS-COMPANY replay: company A's captured invitation request,
//     replayed with company B's session, creates nothing (the server derives
//     the company from B's session and the brief is not B's);
//   - a deal-room draft is COPY-ONLY: copying it calls no server action and
//     writes no message.
// g-actions.mjs already covers Cancel, Escape, double click, replay, wrong
// role and idempotent brief drafts.
//
//   DB_URL=... API_URL=... SERVICE_ROLE_KEY=... APP_URL=http://localhost:3200 \
//     node scripts/isolated-validation/g-action-safety.mjs
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.APP_URL ?? "http://localhost:3200";
const { API_URL, SERVICE_ROLE_KEY } = process.env;
const sql = (q) => execSync(`psql "$DB_URL" -XqAt -c "${q.replace(/(["$`\\])/g, "\\$1")}"`, { encoding: "utf8" }).trim();
const first = (q) => sql(q).split("\n")[0];
const svc = { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}`, "content-type": "application/json" };
const RUN = Date.now().toString(36);
let n = 0;
const ok = (m) => console.log(`ok ${++n} - ${m}`);
const COMPANY = first("select id from profiles where primary_email='ux-company@example.invalid'");
const CREATOR = first("select id from profiles where primary_email='ux-creator@example.invalid'");
const invites = (brief) => Number(sql(`select count(*) from invitations where brief_id='${brief}'`));

const browser = await chromium.launch();
async function login(email, password) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', password);
  await Promise.all([p.waitForURL(/dashboard/), p.click('form button[type="submit"]')]);
  return { ctx, p };
}
async function ask(p, text) {
  const panel = p.locator("section[role=dialog]");
  if (!(await panel.count())) await p.getByRole("button", { name: /Open G/ }).click();
  const before = await panel.locator(".me-4").count();
  await panel.getByRole("textbox", { name: /Ask G/ }).fill(text);
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await panel.locator(".me-4").nth(before).waitFor({ timeout: 60000 });
  return panel.locator(".me-4").nth(before);
}
const dialog = (p) => p.getByRole("dialog").filter({ hasNot: p.locator("section") }).last();
function capture(p) {
  return new Promise((resolve) => {
    const on = (req) => {
      if (req.method() === "POST" && req.headers()["next-action"]) {
        p.off("request", on);
        resolve({ url: req.url(), headers: req.headers(), body: req.postDataBuffer() });
      }
    };
    p.on("request", on);
  });
}
async function replay(ctx, captured) {
  const headers = Object.fromEntries(Object.entries(captured.headers).filter(([k]) => !["cookie", "content-length", "host"].includes(k)));
  const r = await ctx.request.post(captured.url, { headers, data: captured.body, maxRedirects: 0 });
  return r.status();
}

let companyB = null;
let room = null;
const archived = [];
try {
  sql(`delete from invitations where company_id='${COMPANY}'; delete from rate_limits where key like 'g_chat%' or key like 'collab_write%'`);
  const co = await login("ux-company@example.invalid", "Ux-Company-1234!");

  // --- 1. Stale proposal: the brief is archived before the user confirms -------
  let r = await ask(co.p, "Recommend creators for my campaign");
  const invite = r.getByRole("button", { name: "Review and send invitation" });
  await invite.waitFor();
  const briefId = await r.locator('input[name="brief_id"]').first().inputValue();
  sql(`update briefs set status='archived', archived_at=now() where id='${briefId}' and company_id='${COMPANY}'`);
  archived.push(briefId);
  await invite.click();
  await dialog(co.p).waitFor();
  await dialog(co.p).getByRole("button", { name: "Send", exact: true }).click();
  await r.getByRole("alert").first().waitFor({ timeout: 20000 });
  assert.equal(await r.getByText("Invitation sent.").count(), 0, "no success message");
  assert.equal(invites(briefId), 0);
  ok("stale proposal: the brief was archived after G prepared the invitation; confirming is refused by the server, nothing is created, and an error is shown");
  if (await dialog(co.p).count()) await co.p.keyboard.press("Escape");
  await co.p.waitForTimeout(400);

  // --- 2. Cross-company replay ---------------------------------------------------
  sql(`update briefs set status='published', archived_at=null where id='${briefId}'`);
  archived.length = 0;
  sql("delete from rate_limits where key like 'g_chat%' or key like 'collab_write%'");
  r = await ask(co.p, "Recommend creators for my campaign");
  const invite2 = r.getByRole("button", { name: "Review and send invitation" });
  const brief2 = await r.locator('input[name="brief_id"]').first().inputValue();
  const req = capture(co.p);
  await invite2.click();
  await dialog(co.p).waitFor();
  await dialog(co.p).getByRole("button", { name: "Send", exact: true }).click();
  await r.getByText("Invitation sent.").waitFor({ timeout: 20000 });
  const call = await req;
  sql(`delete from invitations where brief_id='${brief2}'`);

  const PW = `G-CoB-${RUN}-Aa1!`;
  const emailB = `g-company-b-${RUN}@example.invalid`;
  const u = await (await fetch(`${API_URL}/auth/v1/admin/users`, { method: "POST", headers: svc, body: JSON.stringify({ email: emailB, password: PW, email_confirm: true, app_metadata: { must_change_password: false } }) })).json();
  assert.ok(u.id, JSON.stringify(u));
  companyB = u.id;
  sql(`insert into profiles (id, full_name, role, primary_email, account_status, must_change_password) values ('${u.id}', 'Company B ${RUN}', 'company', '${emailB}', 'active', false)`);
  const b = await login(emailB, PW);
  const status = await replay(b.ctx, call);
  assert.equal(invites(brief2), 0, `company B's replay of A's invitation (${status}) creates nothing`);
  assert.equal(Number(sql(`select count(*) from invitations where company_id='${u.id}'`)), 0);
  ok(`cross-company: company A's captured invitation request, replayed with company B's session, creates nothing (HTTP ${status})`);

  // --- 3. Deal-room drafts are copy-only ----------------------------------------
  room = first(`insert into deal_chats (creator_id, company_id, sender_email, deal_status, offered_amount) values ('${CREATOR}', '${COMPANY}', 'sponsor-fixture@example.invalid', 'negotiating', 1000) returning id`);
  sql(`insert into messages (chat_id, sender_id, message_text) values ('${room}', '${COMPANY}', 'Can you confirm the timeline?')`);
  const c = await login("ux-creator@example.invalid", "Ux-Creator-1234!");
  await c.ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await c.p.goto(`${BASE}/inbox/${room}`);
  r = await ask(c.p, "Draft a follow-up for this conversation");
  const before = Number(sql(`select count(*) from messages where chat_id='${room}'`));
  let actions = 0;
  c.p.on("request", (q) => { if (q.method() === "POST" && q.headers()["next-action"]) actions += 1; });
  await r.getByRole("button", { name: /Copy/ }).first().click();
  await c.p.waitForTimeout(1500);
  assert.equal(actions, 0, "copying calls no server action");
  assert.equal(Number(sql(`select count(*) from messages where chat_id='${room}'`)), before, "no message was written");
  assert.equal(await r.getByRole("button", { name: /^Send/ }).count(), 0, "the draft has no send button");
  ok("deal-room follow-up: copying it calls no server action and writes no message; there is no send button");
} finally {
  for (const id of archived) sql(`update briefs set status='published', archived_at=null where id='${id}'`);
  sql(`delete from invitations where company_id='${COMPANY}'`);
  if (room) sql(`delete from deal_chats where id='${room}'`);
  if (companyB) {
    sql(`delete from profiles where id='${companyB}'`);
    await fetch(`${API_URL}/auth/v1/admin/users/${companyB}`, { method: "DELETE", headers: svc });
  }
  sql("delete from rate_limits where key like 'g_chat%' or key like 'collab_write%'");
  await browser.close();
}
console.log(`\n${n} checks passed`);

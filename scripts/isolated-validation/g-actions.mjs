// Isolated stack only. G's prepared actions in a real browser, AI down
// (MOCK_NVIDIA mode "down"), ux-* accounts from the README:
//   - declining (Cancel or Escape) never runs the action;
//   - confirming runs it exactly once, even with a double click, and the
//     proposal cannot be submitted again afterwards;
//   - replaying the captured server-action request is refused by the server
//     for a duplicate invitation, and for a user without the role.
//
//   DB_URL=... APP_URL=http://127.0.0.1:3200 node scripts/isolated-validation/g-actions.mjs
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.APP_URL ?? "http://127.0.0.1:3200";
const sql = (q) => execSync(`psql "$DB_URL" -XqAt -c "${q}"`, { encoding: "utf8" }).trim();
const CREATOR = "(select id from profiles where primary_email='ux-creator@example.invalid')";
const COMPANY = "(select id from profiles where primary_email='ux-company@example.invalid')";
const count = {
  content: () => Number(sql(`select count(*) from content_items where creator_id=${CREATOR}`)),
  invites: () => Number(sql(`select count(*) from invitations where company_id=${COMPANY}`)),
  briefs: () => Number(sql(`select count(*) from briefs where company_id=${COMPANY}`)),
  draftBriefs: () => Number(sql(`select count(*) from briefs where company_id=${COMPANY} and status='draft'`)),
};

let n = 0;
const ok = (m) => console.log(`ok ${++n} - ${m}`);
const browser = await chromium.launch();

async function login(email, password) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', password);
  await Promise.all([p.waitForURL(/dashboard/), p.click('form button[type="submit"]')]);
  await p.waitForLoadState("networkidle");
  await p.getByRole("button", { name: /Open G/ }).click();
  await p.locator("section[role=dialog]").waitFor();
  return { ctx, p };
}
async function ask(p, text) {
  const panel = p.locator("section[role=dialog]");
  const before = await panel.locator(".me-4").count();
  await panel.getByRole("textbox", { name: /Ask G/ }).fill(text);
  const answered = p.waitForResponse((res) => res.url().endsWith("/api/g") && res.request().method() === "POST", { timeout: 90_000 });
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await answered;
  await p.waitForFunction(([sel, n]) => document.querySelectorAll(sel).length > n, ["section[role=dialog] .me-4", before]);
  await p.waitForTimeout(300);
  return panel.locator(".me-4").last();
}
const dialog = (p) => p.locator("dialog[open]");
/** Records the next server-action POST so it can be replayed. */
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
  return { status: r.status(), text: await r.text() };
}

try {
  sql(`delete from content_items where creator_id=${CREATOR}; delete from invitations where company_id=${COMPANY}; delete from briefs where company_id=${COMPANY} and status='draft'; delete from rate_limits where key like 'g_chat%' or key like 'content_write%' or key like 'collab_write%'`);

  // ---------------- creator: content draft ----------------
  const c = await login("ux-creator@example.invalid", "Ux-Creator-1234!");
  let r = await ask(c.p, "Give me video ideas for my content plan");
  const save = r.getByRole("button", { name: "Save to my content plan" });
  await save.click();
  await dialog(c.p).waitFor();
  await dialog(c.p).getByRole("button", { name: "Cancel" }).click();
  await save.click();
  await dialog(c.p).waitFor();
  await c.p.keyboard.press("Escape");
  await c.p.waitForTimeout(800);
  assert.equal(count.content(), 0);
  ok("creator: Cancel and Escape both close the confirmation and save nothing");

  await save.click();
  await dialog(c.p).waitFor();
  const confirmBtn = dialog(c.p).getByRole("button", { name: "Save", exact: true });
  await confirmBtn.dblclick();
  await r.getByText("Saved to your content plan.").waitFor({ timeout: 20_000 });
  assert.equal(count.content(), 1);
  assert.ok(await save.isDisabled(), "the proposal is spent");
  await save.click({ force: true });
  await c.p.waitForTimeout(800);
  assert.equal(await dialog(c.p).count(), 0);
  assert.equal(count.content(), 1);
  ok("creator: a double-clicked Confirm saves exactly one draft, and the proposal cannot be saved again");

  // ---------------- company: brief draft ----------------
  const co = await login("ux-company@example.invalid", "Ux-Company-1234!");
  const briefsBefore = count.briefs();
  r = await ask(co.p, "We need gaming creators on YouTube in Egypt for a new brief, budget up to 3000");
  const saveBrief = r.getByRole("button", { name: "Review and save as a draft brief" });
  await saveBrief.click();
  await dialog(co.p).waitFor();
  await dialog(co.p).getByRole("button", { name: "Cancel" }).click();
  await co.p.waitForTimeout(600);
  assert.equal(count.briefs(), briefsBefore);
  ok("company: declining the brief draft creates nothing");

  const briefReq = capture(co.p);
  await saveBrief.click();
  await dialog(co.p).waitFor();
  await dialog(co.p).getByRole("button", { name: "Save draft" }).click();
  await r.getByText(/Saved as a draft brief/).waitFor({ timeout: 20_000 });
  const briefCall = await briefReq;
  assert.equal(count.briefs(), briefsBefore + 1);
  assert.equal(count.draftBriefs(), 1, "saved as a draft, never published");
  assert.ok(await saveBrief.isDisabled());
  ok("company: confirming saves exactly one draft brief (status draft), and the proposal is spent");

  // ---------------- company: invitation ----------------
  const inviteReq = capture(co.p);
  r = await ask(co.p, "Recommend creators for my campaign");
  const invite = r.getByRole("button", { name: "Review and send invitation" });
  await invite.click();
  await dialog(co.p).waitFor();
  await co.p.keyboard.press("Escape");
  await co.p.waitForTimeout(600);
  assert.equal(count.invites(), 0);
  ok("company: declining the invitation sends nothing");

  await invite.click();
  await dialog(co.p).waitFor();
  await dialog(co.p).getByRole("button", { name: "Send", exact: true }).click();
  await r.getByText("Invitation sent.").waitFor({ timeout: 20_000 });
  const inviteCall = await inviteReq;
  assert.equal(count.invites(), 1);
  ok("company: confirming sends exactly one invitation");

  // Replays of the real requests, outside the UI.
  const dup = await replay(co.ctx, inviteCall);
  assert.equal(count.invites(), 1, `duplicate replay must not add an invitation (${dup.status})`);
  ok("server: replaying the same invitation request is refused; still one invitation");

  const asCreator = await replay(c.ctx, inviteCall);
  assert.equal(count.invites(), 1, `creator replay (${asCreator.status})`);
  const briefAsCreator = await replay(c.ctx, briefCall);
  assert.equal(count.briefs(), briefsBefore + 1, `creator replay of the brief (${briefAsCreator.status})`);
  ok(`server: the company's invitation and brief requests, replayed with a creator's session, change nothing (${asCreator.status}, ${briefAsCreator.status})`);

  // Positive control: the same brief request replayed by the company itself
  // does reach the action, which proves the refusals above were the server's.
  // It also documents a limit: the server has no idempotency key for drafts,
  // so a deliberate replay outside the UI creates a second draft. The UI
  // cannot do this (the proposal is spent after one success).
  const ownReplay = await replay(co.ctx, briefCall);
  assert.equal(count.briefs(), briefsBefore + 2, `own replay (${ownReplay.status})`);
  sql(`delete from briefs where id = (select id from briefs where company_id=${COMPANY} and status='draft' order by created_at desc limit 1)`);
  ok("control: the replay mechanism reaches the server (the company's own replay creates a second draft, removed again)");

  r = await ask(co.p, "Recommend creators for my campaign");
  assert.equal(await r.getByRole("button", { name: "Review and send invitation" }).count(), 0);
  assert.match(await r.innerText(), /Already invited to: Ramadan launch/);
  ok("company: G marks the creator as already invited and does not propose it again");

  // ---------------- creator: opportunities ----------------
  r = await ask(c.p, "Which opportunities fit me?");
  const text = await r.innerText();
  assert.match(text, /Open briefs that fit you/);
  assert.match(text, /Ramadan launch/);
  assert.match(text, /You were invited to this brief\./);
  ok("creator: the matching brief is shown with its reasons and the invitation just sent");
} finally {
  sql("delete from rate_limits where key like 'g_chat%' or key like 'content_write%' or key like 'collab_write%'");
  await browser.close();
}
console.log(`\n${n} checks passed`);

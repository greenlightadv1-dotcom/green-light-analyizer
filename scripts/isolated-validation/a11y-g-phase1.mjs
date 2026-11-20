// Isolated stack only. axe-core WCAG 2.0/2.1 A+AA on the Phase 1 G surfaces
// that a11y-axe.mjs does not reach: the G panel open in a deal room with the
// Deal Room card, the creator's Opportunities card, and the applicant helper
// on /apply with its card. Light desktop and dark phone. AI down (rules).
//
//   DB_URL=... APP_URL=http://localhost:3200 node scripts/isolated-validation/a11y-g-phase1.mjs
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = process.env.APP_URL ?? "http://localhost:3200";
const sql = (q) => execSync(`psql "$DB_URL" -XqAt -c "${q.replace(/(["$`\\])/g, "\\$1")}"`, { encoding: "utf8" }).trim();
const first = (q) => sql(q).split("\n")[0];
const creator = first("select id from profiles where primary_email='ux-creator@example.invalid'");
const company = first("select id from profiles where primary_email='ux-company@example.invalid'");

async function scan(p, label) {
  await p.addScriptTag({ content: AXE });
  const v = await p.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((x) => ({ id: x.id, n: x.nodes.length, ex: x.nodes.slice(0, 2).map((y) => y.target.join(" ")) })));
  console.log(`${label}: ${v.length ? JSON.stringify(v) : "0 violations"}`);
  return v.length;
}

const browser = await chromium.launch();
let room = null;
let req = null;
let total = 0;
try {
  sql("delete from rate_limits where key like 'g_chat%' or key like 'g_applicant%'");
  room = first(`insert into deal_chats (creator_id, company_id, sender_email, deal_status, offered_amount) values ('${creator}', '${company}', 'sponsor-fixture@example.invalid', 'negotiating', 1000) returning id`);
  sql(`insert into messages (chat_id, sender_id, message_text) values ('${room}', '${company}', 'Can we do \$800 instead? When can you deliver?')`);
  req = first("insert into access_requests (email_verified_at, journey, full_name, email) values (now(), 'creator', 'A11y Applicant', 'a11y-applicant@example.invalid') returning id");
  sql(`insert into verification_cases (access_request_id, kind, status, info_request) values ('${req}', 'creator_kyc', 'needs_info', 'Please retake the selfie.')`);
  const raw = randomBytes(32).toString("base64url");
  sql(`insert into application_tokens (access_request_id, purpose, token_hash, expires_at) values ('${req}', 'resume', '${createHash("sha256").update(raw).digest("hex")}', now() + interval '1 day')`);

  for (const mode of [{ name: "desktop light", viewport: { width: 1440, height: 900 }, colorScheme: "light" }, { name: "phone dark", viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true }]) {
    const ctx = await browser.newContext({ viewport: mode.viewport, colorScheme: mode.colorScheme, isMobile: mode.isMobile });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill('input[name="email"]', "ux-creator@example.invalid");
    await p.fill('input[name="password"]', "Ux-Creator-1234!");
    await Promise.all([p.waitForURL(/dashboard/), p.click('form button[type="submit"]')]);
    for (const [page, q, card] of [[`/inbox/${room}`, "Summarise this conversation", "g-dealroom-card"], ["/opportunities", "Which briefs fit me?", "g-opp-how"]]) {
      await p.goto(`${BASE}${page}`);
      const panel = p.locator("section[role=dialog]");
      // The panel stays open across navigation; open it only if it is closed.
      await p.waitForLoadState("networkidle");
      // Desktop has the floating "Open G" launcher; phones open G from the tab bar's "Ask G".
      if (!(await panel.count())) {
        if (mode.isMobile) await p.getByRole("button", { name: "Ask G", exact: true }).click();
        else await p.getByRole("button", { name: /Open G/ }).click();
      }
      await panel.getByRole("textbox", { name: /Ask G/ }).fill(q);
      await panel.getByRole("button", { name: "Send", exact: true }).click();
      await panel.getByTestId(card).waitFor({ timeout: 60000 });
      total += await scan(p, `${mode.name} ${page} with G open`);
    }
    const a = await browser.newContext({ viewport: mode.viewport, colorScheme: mode.colorScheme, isMobile: mode.isMobile });
    await a.addCookies([{ name: "gl_application", value: raw, domain: new URL(BASE).hostname, path: "/", httpOnly: true }]);
    const ap = await a.newPage();
    await ap.goto(`${BASE}/apply`);
    const help = ap.getByTestId("g-applicant");
    await help.getByRole("button", { name: "Ask G" }).click();
    await help.getByRole("button", { name: "What's still missing?" }).click();
    await help.getByTestId("g-applicant-card").waitFor({ timeout: 60000 });
    total += await scan(ap, `${mode.name} /apply with the applicant helper open`);
  }
  assert.equal(total, 0, "axe violations found");
  console.log("\n0 violations");
} finally {
  if (room) sql(`delete from deal_chats where id='${room}'`);
  if (req) sql(`delete from access_requests where id='${req}'`);
  sql("delete from rate_limits where key like 'g_chat%' or key like 'g_applicant%'");
  await browser.close();
}

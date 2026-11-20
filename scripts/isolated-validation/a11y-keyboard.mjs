// Isolated stack only. axe on public pages (en light, ar dark phone), skip link,
// and a visible focus style on 40 Tab stops of the creator dashboard.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = process.env.APP_URL ?? "http://127.0.0.1:3200";
const b = await chromium.launch();
let n = 0; const ok = (m) => console.log(`ok ${++n} - ${m}`);
// Public pages: axe in en light, ar dark, phone.
for (const [lang, theme, w] of [["en", "light", 1440], ["ar", "dark", 390]]) {
  const c = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: theme });
  await c.addInitScript((l) => localStorage.setItem("greenlight-locale", l), lang);
  const p = await c.newPage();
  for (const path of ["/", "/login", "/forgot-password", "/get-started", "/terms", "/privacy"]) {
    await p.goto(BASE + path, { waitUntil: "networkidle" }); await p.waitForTimeout(400);
    await p.addScriptTag({ content: AXE });
    const v = await p.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((x) => `${x.id}(${x.nodes.length}) ${x.nodes[0].target.join(" ")} ${(x.nodes[0].failureSummary || "").split("\n")[1] || ""}`.slice(0, 220)));
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (v.length || ov > 0) console.log("PUBLIC", lang, theme, w, path, "overflow", ov, JSON.stringify(v));
  }
  await c.close();
}
ok("public pages scanned (violations listed above, if any)");
// Keyboard: skip link, focus order, visible focus.
const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await c.newPage();
await p.goto(BASE + "/login");
await p.fill('input[name="email"]', "ux-creator@example.invalid"); await p.fill('input[name="password"]', "Ux-Creator-1234!");
await Promise.all([p.waitForURL(/dashboard/), p.click('form button[type="submit"]')]);
await p.waitForLoadState("networkidle");
await p.keyboard.press("Tab");
const first = await p.evaluate(() => ({ text: document.activeElement.textContent.trim(), visible: document.activeElement.getBoundingClientRect().width > 1 }));
assert.equal(first.text, "Skip to main content"); assert.ok(first.visible, "skip link becomes visible on focus");
ok("first Tab reaches a visible 'Skip to main content' link");
await p.keyboard.press("Enter");
await p.keyboard.press("Tab");
const afterSkip = await p.evaluate(() => !!document.activeElement.closest("#main-content"));
assert.ok(afterSkip, "after skipping, focus continues inside main");
ok("Enter on the skip link moves focus into the main content, past the sidebar and top bar");
// Every focusable element shows a visible focus indicator (outline or box-shadow).
await p.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
const missing = [];
for (let i = 0; i < 40; i++) {
  await p.keyboard.press("Tab");
  const r = await p.evaluate(() => {
    const el = document.activeElement; if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const has = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none");
    return { has, label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40) };
  });
  if (r && !r.has) missing.push(r.label);
}
console.log("no visible focus on:", JSON.stringify([...new Set(missing)]));
ok("tabbed through 40 stops on the dashboard and recorded any without a visible focus style");
await b.close();

// Isolated stack only (ux-* accounts, see README). axe-core WCAG 2.0/2.1 A+AA on every
// signed-in page per role, desktop light and phone dark. CHAT=<a creator deal id>.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = process.env.APP_URL ?? "http://127.0.0.1:3200";
const ROLES = {
  creator: ["ux-creator@example.invalid", "Ux-Creator-1234!", ["/dashboard", "/inbox", "/inbox/" + process.env.CHAT, "/media-kit", "/analyzer", "/opportunities", "/collaborations", "/content", "/portfolio", "/settings", "/pricing", "/support", "/onboarding", "/notifications"]],
  company: ["ux-company@example.invalid", "Ux-Company-1234!", ["/dashboard", "/discover", "/briefs", "/briefs/new", "/shortlists", "/team", "/collaborations", "/inbox", "/settings"]],
  admin: ["ux-admin@example.invalid", "Ux-Admin-1234!", ["/dashboard", "/admin/users", "/admin/requests", "/admin/verification", "/admin/taxonomy", "/admin/violations", "/admin/relays", "/admin/news", "/admin/system", "/admin/promo-codes"]],
};
const b = await chromium.launch();
const totals = {};
for (const [role, [email, pw, paths]] of Object.entries(ROLES)) {
  const lc = await b.newContext(); const lp = await lc.newPage();
  await lp.goto(BASE + "/login"); await lp.fill('input[name="email"]', email); await lp.fill('input[name="password"]', pw);
  await Promise.all([lp.waitForURL(/dashboard/), lp.click('form button[type="submit"]')]);
  const state = await lc.storageState(); await lc.close();
  for (const [w, theme] of [[1440, "light"], [390, "dark"]]) {
    const ctx = await b.newContext({ storageState: state, viewport: { width: w, height: 900 }, colorScheme: theme });
    const p = await ctx.newPage();
    for (const path of paths) {
      await p.goto(BASE + path, { waitUntil: "networkidle" });
      await p.waitForTimeout(400);
      await p.addScriptTag({ content: AXE });
      const res = await p.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0, 2).map((x) => x.target.join(" ") + " :: " + (x.failureSummary || "").split("\n").slice(1, 2).join("").slice(0, 140)) })));
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      for (const v of res) { const k = `${v.id}`; totals[k] = (totals[k] || 0) + v.n; }
      if (res.length || overflow > 0) console.log(`${role} ${w} ${theme} ${path} overflow=${overflow}`, JSON.stringify(res));
    }
    await ctx.close();
  }
}
console.log("TOTALS", JSON.stringify(totals));
await b.close();

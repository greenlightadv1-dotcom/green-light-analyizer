// Browser checks for the collaboration preview screens (en + ar, desktop +
// phone): every page renders, no untranslated dictionary key leaks, no
// horizontal page scroll, no console errors, and each confirm-gated action
// opens its dialog before anything is sent. Run against a preview build:
//   NEXT_PUBLIC_ENABLE_UI_PREVIEW=1 npm run build && npx next start -p 3668
//   node scripts/collab-ui-e2e.mjs [baseUrl] [screenshotDir]
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] ?? "http://localhost:3668";
const SHOTS = process.argv[3] ?? null;
const PAGES = [
  ["/preview/briefs", "briefs"],
  ["/preview/briefs/00000000-0000-4000-8000-0000000000b1", "brief"],
  ["/preview/opportunities", "opportunities"],
  ["/preview/collaborations", "collaborations"],
  ["/preview/collaborations/00000000-0000-4000-8000-0000000000e1", "collab-creator"],
  ["/preview/collaborations/00000000-0000-4000-8000-0000000000e1?side=company", "collab-company"],
  ["/preview/notifications", "notifications"],
  ["/preview/shortlists", "shortlists"],
  ["/preview/portfolio", "portfolio"],
];
let pass = 0, fail = 0;
const check = (ok, label) => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"} ${label}`); };

const browser = await chromium.launch();
for (const locale of ["en", "ar"]) {
  for (const [w, h, vp] of [[1440, 900, "desktop"], [390, 844, "phone"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript((l) => localStorage.setItem("greenlight-locale", l), locale);
    for (const [path, name] of PAGES) {
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      page.on("pageerror", (e) => errors.push(String(e)));
      const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
      const tag = `${locale} ${vp} ${name}`;
      check(res?.status() === 200, `${tag}: 200`);
      const text = await page.locator("main, body").first().innerText();
      const leaked = text.match(/\b(collab|analyzer|taxonomy|ui|notifications|shortlists|portfolio)\.[a-zA-Z_.]+/g);
      check(!leaked, `${tag}: no raw keys${leaked ? " " + leaked.slice(0, 3).join(",") : ""}`);
      if (locale === "ar") check((await page.getAttribute("html", "dir")) === "rtl", `${tag}: rtl`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(overflow <= 1, `${tag}: no horizontal scroll (${overflow}px)`);
      check(errors.length === 0, `${tag}: no console errors${errors.length ? " " + errors[0].slice(0, 120) : ""}`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${locale}-${vp}-${name}.png`, fullPage: true });
      await page.close();
    }
    await ctx.close();
  }
}

// Confirmation gating: pressing an action opens a dialog; cancelling sends nothing.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem("greenlight-locale", "en"));
const page = await ctx.newPage();
let posts = 0;
page.on("request", (r) => { if (r.method() === "POST") posts++; });
await page.goto(BASE + "/preview/opportunities", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Accept", exact: true }).first().click();
const dialog = page.getByRole("dialog");
check(await dialog.isVisible(), "accept opens a confirmation dialog");
check((await dialog.innerText()).includes("Accept this invitation?"), "dialog names the action");
await dialog.getByRole("button", { name: /cancel/i }).click();
check(!(await dialog.isVisible()), "cancel closes the dialog");
check(posts === 0, "cancel sends nothing");

await page.goto(BASE + "/preview/collaborations/00000000-0000-4000-8000-0000000000e1?side=company", { waitUntil: "networkidle" });
check(await page.getByRole("button", { name: "Mark as completed" }).count() === 0, "complete hidden while a deliverable is open");
check(await page.getByRole("button", { name: "Confirm these terms" }).count() === 0, "confirm hidden once agreed");
await page.goto(BASE + "/preview/collaborations/00000000-0000-4000-8000-0000000000e1", { waitUntil: "networkidle" });
check(await page.getByRole("button", { name: "Submit work" }).count() === 2, "creator can submit both open deliverables");
check(await page.getByRole("button", { name: "Approve" }).count() === 0, "creator cannot approve");
check(await page.getByText("10% commission").count() >= 1, "commission note shown");
// Notifications: the bell shows the unread badge and links to the page;
// unread items are marked for screen readers; preferences reflect muting.
await page.goto(BASE + "/preview/notifications", { waitUntil: "networkidle" });
const bell = page.getByRole("link", { name: "Notifications, 2 unread" });
check(await bell.count() >= 1, "bell announces the unread count");
check((await page.getByText("(Unread)").count()) === 2, "two unread items are labelled for screen readers");
check(!(await page.getByLabel("Completion and cancellation").isChecked()), "muted category is unticked");
check(await page.getByLabel("Invitations and responses").isChecked(), "other categories stay on");
// Shortlists: removing asks first and cancelling sends nothing.
posts = 0;
await page.goto(BASE + "/preview/shortlists", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Remove", exact: true }).first().click();
const sdialog = page.getByRole("dialog");
check((await sdialog.innerText()).includes("Remove Layla Hassan (demo) from this list?"), "remove names the creator");
await sdialog.getByRole("button", { name: /cancel/i }).click();
check(posts === 0, "cancelled removal sends nothing");

// Portfolio: public/private is visible, an unconsented brand is flagged, and
// the portfolio section defaults are shown as checkboxes.
await page.goto(BASE + "/preview/portfolio", { waitUntil: "networkidle" });
check((await page.getByText("Private", { exact: true }).count()) === 1, "one private item is labelled");
check((await page.getByText("Brand not shown publicly").count()) === 1, "unconsented brand is flagged");
check(await page.getByLabel("Bio").isChecked(), "bio section on by default");
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

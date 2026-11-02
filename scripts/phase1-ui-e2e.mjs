/**
 * Phase 1 browser checks against the UI preview (no database, no network
 * beyond localhost). Run:
 *   NEXT_PUBLIC_ENABLE_UI_PREVIEW=1 npm run build && npm run start -- -p 3668 &
 *   node scripts/phase1-ui-e2e.mjs [http://127.0.0.1:3668] [screenshot-dir]
 *
 * Covers, in English and Arabic at 1440px and 390px:
 *  - every preview page: no horizontal overflow, no untranslated Phase 1 key,
 *    correct dir on <html>;
 *  - the deal-status ConfirmDialog: opens on click, Cancel has focus, Escape
 *    closes it and returns focus to the trigger, Confirm shows the success
 *    note only after confirming, the dialog sits inside the viewport, and its
 *    close button is on the logical end side;
 *  - the G launcher: inside the viewport, on the end side, icon-only on
 *    phones with an accessible name, and the page's last content can scroll
 *    clear of it.
 * The preview's status control never calls the server (demo mode).
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.argv[2] ?? "http://127.0.0.1:3668";
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const PAGES = ["", "dashboard", "analyzer", "inbox", "inbox/00000000-0000-4000-8000-00000000aa01", "media-kit", "onboarding", "pricing", "settings", "support"];
const ROOM = "/preview/inbox/00000000-0000-4000-8000-00000000aa01";
const RAW_KEY = /\b(ui|dealStatus|companyDashboard|admin)\.[a-zA-Z]+(\.[a-zA-Z]+)*\b/;

let pass = 0;
let fail = 0;
const check = (ok, msg) => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${msg}`);
};

const browser = await chromium.launch();
for (const locale of ["en", "ar"]) {
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const tag = `${locale} ${vp.width}px`;
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addInitScript((l) => localStorage.setItem("greenlight-locale", l), locale);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    for (const path of PAGES) {
      await page.goto(`${BASE}/preview/${path}`, { waitUntil: "networkidle" });
      const r = await page.evaluate(() => ({
        dir: document.documentElement.dir,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        text: document.body.innerText,
      }));
      check(r.overflow <= 1, `${tag} /preview/${path} no horizontal overflow (${r.overflow}px)`);
      check(!RAW_KEY.test(r.text), `${tag} /preview/${path} no raw Phase 1 key${RAW_KEY.test(r.text) ? `: ${r.text.match(RAW_KEY)[0]}` : ""}`);
      check(locale === "ar" ? r.dir === "rtl" : r.dir !== "rtl", `${tag} /preview/${path} dir=${r.dir || "ltr"}`);
    }

    // --- Deal status confirmation -------------------------------------------
    await page.goto(`${BASE}${ROOM}`, { waitUntil: "networkidle" });
    const trigger = page.locator("button[aria-pressed='false']:not([disabled])").first();
    await trigger.scrollIntoViewIfNeeded();
    const triggerText = (await trigger.innerText()).trim();
    await trigger.click();
    const dialog = page.locator("dialog[open]");
    await dialog.waitFor({ timeout: 3000 });
    check(await dialog.isVisible(), `${tag} status dialog opens`);
    const title = await dialog.locator("h2").innerText();
    check(title.includes(triggerText), `${tag} dialog title names the target status ("${triggerText}")`);
    const labelled = await dialog.evaluate((d) => {
      const id = d.getAttribute("aria-labelledby");
      return Boolean(id && document.getElementById(id)?.textContent);
    });
    check(labelled, `${tag} dialog is labelled by its title`);
    const focusedIsCancel = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.tagName === "BUTTON" && el.closest("dialog") !== null && !el.getAttribute("aria-label");
    });
    check(focusedIsCancel, `${tag} Cancel has initial focus`);
    const box = await dialog.boundingBox();
    check(Boolean(box) && box.x >= 0 && box.x + box.width <= vp.width + 1, `${tag} dialog fits the viewport`);
    const close = dialog.locator("button[aria-label]").first();
    const closeBox = await close.boundingBox();
    const endSide = locale === "ar" ? closeBox.x < box.x + box.width / 2 : closeBox.x > box.x + box.width / 2;
    check(endSide, `${tag} close button on the logical end side`);
    if (SHOTS && vp.width === 390) await page.screenshot({ path: `${SHOTS}/${locale}-status-dialog.png` });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    check((await page.locator("dialog[open]").count()) === 0, `${tag} Escape closes the dialog`);
    const focusReturned = await page.evaluate((txt) => document.activeElement?.textContent?.trim() === txt, triggerText);
    check(focusReturned, `${tag} focus returns to the trigger`);
    const noteAfterCancel = await page.evaluate(() =>
      [...document.querySelectorAll("p[role='status']")].some((p) => p.closest("section, div") && p.className.includes("text-success")),
    );
    check(!noteAfterCancel, `${tag} cancelling shows no success note`);

    await trigger.click();
    await page.locator("dialog[open]").waitFor({ timeout: 3000 });
    await page.locator("dialog[open] button").last().click();
    await page.waitForTimeout(200);
    check((await page.locator("dialog[open]").count()) === 0, `${tag} Confirm closes the dialog`);
    const noteAfterConfirm = await page.evaluate(() =>
      [...document.querySelectorAll("p[role='status']")].some((p) => p.className.includes("text-success")),
    );
    check(noteAfterConfirm, `${tag} success note appears after confirming`);

    // --- G launcher -----------------------------------------------------------
    await page.goto(`${BASE}/preview/dashboard`, { waitUntil: "networkidle" });
    const launcher = page.locator("[data-testid='g-launcher'] > button").last();
    const lb = await launcher.boundingBox();
    check(Boolean(lb) && lb.x >= 0 && lb.y >= 0 && lb.x + lb.width <= vp.width && lb.y + lb.height <= vp.height, `${tag} G launcher inside the viewport`);
    const onEnd = locale === "ar" ? lb.x + lb.width / 2 < vp.width / 2 : lb.x + lb.width / 2 > vp.width / 2;
    check(onEnd, `${tag} G launcher on the end side`);
    const name = await launcher.getAttribute("aria-label");
    check(Boolean(name && name.trim()), `${tag} G launcher has an accessible name`);
    if (vp.width === 390) {
      check(lb.width <= 56, `${tag} G launcher is icon-only on phones (${Math.round(lb.width)}px wide)`);
    }
    // Scroll to the end: the last content block must end above the launcher.
    const clear = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const column = document.querySelector("div.min-w-0.flex-1.pb-24");
      const blocks = column ? [...column.querySelectorAll(":scope > * , :scope > * > *")] : [];
      const lastBottom = Math.max(...blocks.map((b) => b.getBoundingClientRect().bottom).filter((n) => Number.isFinite(n)));
      const launcherTop = document.querySelector("[data-testid='g-launcher']").getBoundingClientRect().top;
      return { lastBottom, launcherTop };
    });
    check(clear.lastBottom <= clear.launcherTop + 1, `${tag} last content scrolls clear of the G launcher (${Math.round(clear.lastBottom)} <= ${Math.round(clear.launcherTop)})`);
    if (SHOTS && vp.width === 390) await page.screenshot({ path: `${SHOTS}/${locale}-dashboard-bottom.png` });

    // --- Growth summary from real (preview) snapshots --------------------------
    await page.goto(`${BASE}/preview/media-kit`, { waitUntil: "networkidle" });
    const growth = page.locator("[data-testid='growth-summary']").first();
    check((await growth.count()) === 1, `${tag} growth summary present`);
    const gtext = await growth.innerText();
    // 208,500 -> 212,000 subscribers over 8 days: +3,500 (+1.7%).
    check(gtext.includes("+3,500") && gtext.includes("+1.7%"), `${tag} growth computed from the two snapshots (+3,500, +1.7%)`);
    check(locale === "ar" ? /المشتركون/.test(gtext) : /Subscribers/.test(gtext), `${tag} growth labels translated`);
    const gdir = await growth.evaluate((el) => getComputedStyle(el).direction);
    check(locale === "ar" ? gdir === "rtl" : gdir === "ltr", `${tag} growth summary direction ${gdir}`);

    // --- Print stylesheet (Media Kit PDF v1) -----------------------------------
    await page.emulateMedia({ media: "print" });
    const printed = await page.evaluate(() => {
      const panel = document.querySelector(".glass-panel");
      const cs = panel ? getComputedStyle(panel) : null;
      return { bg: getComputedStyle(document.body).backgroundImage, panelBg: cs?.backgroundColor, blur: cs?.backdropFilter };
    });
    check(printed.bg === "none" && printed.panelBg === "rgb(255, 255, 255)" && (printed.blur === "none" || !printed.blur), `${tag} print media: white page, no glass blur`);
    await page.emulateMedia({ media: "screen" });

    check(errors.length === 0, `${tag} no page errors${errors.length ? `: ${errors[0]}` : ""}`);
    await ctx.close();
  }
}
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

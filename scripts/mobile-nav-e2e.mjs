#!/usr/bin/env node
/**
 * Browser check for the mobile navigation drawer, against a running build with
 * the UI preview on (no database needed):
 *
 *   NEXT_PUBLIC_ENABLE_UI_PREVIEW=1 npm run build && npm run start -- -p 3668 &
 *   node scripts/mobile-nav-e2e.mjs [http://127.0.0.1:3668] [screenshot-dir]
 *
 * Exits non-zero on the first failed assertion. Screenshots are written only
 * when a directory is given.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

// Playwright is not a project dependency: require() resolves the globally
// installed copy (the CI sandbox and dev machines both provide one).
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] ?? "http://127.0.0.1:3668";
const SHOTS = process.argv[3] ?? null;
const PAGE = `${BASE}/preview/dashboard`;
const shot = (page, name) => (SHOTS ? page.screenshot({ path: path.join(SHOTS, name), fullPage: false }) : null);

let passed = 0;
const check = async (name, fn) => {
  await fn();
  passed++;
  console.log(`ok - ${name}`);
};

const browser = await chromium.launch();
try {
  // --- desktop: the Sidebar is the navigation, and the menu button is hidden ---
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await desktop.goto(PAGE, { waitUntil: "networkidle" });
  const sidebarLinks = await desktop.locator("aside nav a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  await check("desktop: Sidebar visible with links", async () => {
    assert.ok(await desktop.locator("aside").isVisible());
    assert.ok(sidebarLinks.length >= 5, `sidebar links: ${sidebarLinks}`);
  });
  await check("desktop: no mobile menu button", async () => {
    assert.equal(await desktop.getByRole("button", { name: "Open menu" }).isVisible(), false);
  });
  await shot(desktop, "4-desktop-sidebar.png");
  await desktop.close();

  // --- phone width, LTR ---
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.goto(PAGE, { waitUntil: "networkidle" });
  const menu = page.getByRole("button", { name: "Open menu" });
  const dialog = page.getByRole("dialog");

  await check("phone: Sidebar hidden, menu button visible, drawer closed", async () => {
    assert.equal(await page.locator("aside").isVisible(), false);
    assert.ok(await menu.isVisible());
    assert.equal(await menu.getAttribute("aria-expanded"), "false");
    assert.equal(await dialog.count(), 0);
  });
  await check("phone: no horizontal overflow", async () => {
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(sw <= cw, `scrollWidth ${sw} > clientWidth ${cw}`);
  });
  await shot(page, "1-mobile-closed.png");

  await menu.click();
  await check("open: dialog with the same links as the desktop Sidebar", async () => {
    await dialog.waitFor();
    assert.equal(await dialog.getAttribute("aria-modal"), "true");
    assert.equal(await menu.getAttribute("aria-expanded"), "true");
    const drawerLinks = await dialog.locator("nav a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    assert.deepEqual(drawerLinks, sidebarLinks);
  });
  await check("open: page scroll locked and focus inside the drawer", async () => {
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
    assert.ok(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));
  });
  await check("open: drawer fits the phone screen", async () => {
    const box = await dialog.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 375, JSON.stringify(box));
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(sw <= cw);
  });
  await check("open: Tab stays inside the drawer", async () => {
    const count = await dialog.locator('a[href], button').count();
    for (let i = 0; i < count + 2; i++) await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));
    await page.keyboard.press("Shift+Tab");
    assert.ok(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));
  });
  await shot(page, "2-mobile-open.png");

  await check("Escape closes and returns focus to the menu button", async () => {
    await page.keyboard.press("Escape");
    assert.equal(await dialog.count(), 0);
    assert.equal(await menu.getAttribute("aria-expanded"), "false");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Open menu");
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  });

  await check("clicking outside the drawer closes it", async () => {
    await menu.click();
    await dialog.waitFor();
    await page.mouse.click(360, 400); // the backdrop, right of the 288px-wide panel
    assert.equal(await dialog.count(), 0);
  });

  await check("the close button closes it", async () => {
    await menu.click();
    await page.getByRole("button", { name: "Close menu" }).click();
    assert.equal(await dialog.count(), 0);
  });

  await check("choosing a link navigates and closes the drawer", async () => {
    await menu.click();
    await dialog.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL(/\/preview\/settings$/);
    await page.waitForTimeout(300);
    assert.equal(await dialog.count(), 0);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    assert.equal(await menu.getAttribute("aria-expanded"), "false");
  });
  await ctx.close();

  // --- phone width, Arabic (RTL), dark theme ---
  const rtl = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await rtl.addInitScript(() => {
    localStorage.setItem("greenlight-locale", "ar");
    localStorage.setItem("theme", "dark");
  });
  const ar = await rtl.newPage();
  await ar.goto(PAGE, { waitUntil: "networkidle" });
  await check("RTL: document is dir=rtl and the menu button is labelled in Arabic", async () => {
    assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
    assert.ok(await ar.getByRole("button", { name: "فتح القائمة" }).isVisible());
  });
  await ar.getByRole("button", { name: "فتح القائمة" }).click();
  await check("RTL: drawer opens from the right edge, with the same links", async () => {
    const d = ar.getByRole("dialog");
    await d.waitFor();
    const box = await d.boundingBox();
    assert.ok(box && Math.round(box.x + box.width) === 375 && box.x > 0, JSON.stringify(box));
    const links = await d.locator("nav a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    assert.deepEqual(links, sidebarLinks);
    const { sw, cw } = await ar.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(sw <= cw);
  });
  await shot(ar, "3-mobile-rtl-open.png");
  await rtl.close();

  console.log(`\n${passed} checks passed`);
} finally {
  await browser.close();
}

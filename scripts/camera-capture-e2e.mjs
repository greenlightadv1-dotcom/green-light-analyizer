#!/usr/bin/env node
/**
 * Browser check for the camera-only identity capture and the pre-account
 * application pages, against a running build with the UI preview on:
 *
 *   NEXT_PUBLIC_ENABLE_UI_PREVIEW=1 npm run build && npm run start -- -p 3668 &
 *   node --experimental-strip-types scripts/camera-capture-e2e.mjs [http://127.0.0.1:3668]
 *
 * What this is, and what it is not. Chromium runs with its built-in FAKE
 * camera (--use-fake-device-for-media-stream), so the real getUserMedia →
 * <video> → canvas → JPEG path runs, and the JPEG it produces is checked with
 * the same server function the upload routes use. Denied permission and a
 * missing camera are simulated by making getUserMedia reject with the error
 * a browser raises. It does NOT test a physical camera, Safari, Firefox or a
 * real phone, and nothing is uploaded (the preview is demo mode).
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { checkCameraJpeg } from "../src/lib/verification/camera.ts";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.argv[2] ?? "http://127.0.0.1:3668";
let passed = 0;
const check = (cond, msg) => { assert.ok(cond, msg); passed++; console.log(`PASS ${msg}`); };

const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });

async function ctxFor({ locale = "en", width = 1280, reject = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, permissions: ["camera"] });
  await ctx.addInitScript((l) => localStorage.setItem("greenlight-locale", l), locale);
  // Keep the last canvas blob so the test can read the exact bytes that would be uploaded
  // (fetching the preview's blob: URL is blocked by the page's own CSP, as it should be).
  await ctx.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, ...rest) {
      return orig.call(this, (b) => { window.__lastBlob = b; cb(b); }, ...rest);
    };
  });
  if (reject) {
    await ctx.addInitScript((name) => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error(name), { name }));
    }, reject);
  }
  return ctx;
}

// 1. Capture with the fake camera: preview, retake, confirm.
{
  const ctx = await ctxFor();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/preview/apply`, { waitUntil: "networkidle" });
  check((await page.locator('input[type="file"]').count()) === 0, "application page has no file input at all");
  check((await page.locator("[data-camera-slot]").count()) === 3, "three camera slots: selfie, ID front, ID back");
  check(await page.getByText("Step 1 of 3").isVisible(), "the current document and step are named");
  check(await page.locator('[data-camera-slot="id_front"]').getByText("Captured").isVisible(), "an already captured side shows as captured");
  check((await page.locator('[role="button"][aria-label*="Drop"], [ondrop]').count()) === 0, "no drag-and-drop target");

  const selfie = page.locator('[data-camera-slot="selfie"]');
  check(await selfie.getByText("Our team compares it").isVisible(), "explains why the photo is needed");
  await selfie.getByRole("button", { name: "Open camera" }).click();
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-camera-slot="selfie"] video');
    return v && v.videoWidth > 0 && v.readyState >= 2;
  }, null, { timeout: 15000 });
  check(true, "the fake camera streams into the in-page video");
  await selfie.getByRole("button", { name: "Take photo" }).click();
  const img = selfie.locator("img");
  await img.waitFor({ timeout: 10000 });
  check(await selfie.getByRole("button", { name: "Use this photo" }).isVisible(), "preview offers confirm");
  check(await selfie.getByRole("button", { name: "Retake" }).isVisible(), "preview offers retake");

  // The captured frame is exactly what would be uploaded: check it with the server's own function.
  const bytes = await page.evaluate(async () => Array.from(new Uint8Array(await window.__lastBlob.arrayBuffer())));
  const verdict = checkCameraJpeg(new Uint8Array(bytes));
  check(verdict.ok === true, `the canvas JPEG passes the server check (${JSON.stringify(verdict)})`);
  check(!Buffer.from(bytes).includes(Buffer.from("Exif")), "the captured JPEG carries no EXIF");

  await selfie.getByRole("button", { name: "Retake" }).click();
  await page.waitForFunction(() => document.querySelector('[data-camera-slot="selfie"] video')?.videoWidth > 0, null, { timeout: 15000 });
  check((await selfie.locator("img").count()) === 0, "retake discards the preview and reopens the camera");
  await selfie.getByRole("button", { name: "Take photo" }).click();
  await selfie.locator("img").waitFor();
  await selfie.getByRole("button", { name: "Use this photo" }).click();
  await selfie.getByText("Captured").waitFor();
  check(true, "confirm marks the slot captured");
  check(await page.evaluate(() => [...document.querySelectorAll("video")].every((v) => !v.srcObject || v.srcObject.getTracks().every((t) => t.readyState === "ended"))), "the camera stops after capture");
  await ctx.close();
}

// 2. Permission refused: explained, no fallback to a file picker.
for (const [name, title] of [["NotAllowedError", "Camera permission was refused"], ["NotFoundError", "No camera found"], ["NotReadableError", "The camera is in use"]]) {
  const ctx = await ctxFor({ reject: name });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/preview/apply`, { waitUntil: "networkidle" });
  const slot = page.locator('[data-camera-slot="id_back"]');
  await slot.getByRole("button", { name: "Open camera" }).click();
  const alert = slot.getByRole("alert");
  await alert.waitFor();
  check((await alert.innerText()).includes(title), `${name}: "${title}" is explained`);
  check((await alert.innerText()).includes("emailed link"), `${name}: says how to resume safely`);
  check((await page.locator('input[type="file"]').count()) === 0, `${name}: no file input appears as a fallback`);
  check(await slot.getByRole("button", { name: "Try again" }).isVisible(), `${name}: try again is offered`);
  await ctx.close();
}

// 3. Arabic, RTL, and phone width.
{
  const ctx = await ctxFor({ locale: "ar", width: 390 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/preview/apply`, { waitUntil: "networkidle" });
  check((await page.getAttribute("html", "dir")) === "rtl", "ar: page is RTL");
  check(await page.getByText("صور الهوية").first().isVisible(), "ar: camera section is translated");
  check(await page.getByText("الخطوة 1 من 3").isVisible(), "ar: step counter is translated");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `390px: no horizontal scroll (${overflow}px)`);
  await ctx.close();
}

// 4. Activation preview, and the real public routes without a database.
{
  const ctx = await ctxFor();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/preview/activate`, { waitUntil: "networkidle" });
  check((await page.locator('input[type="password"]').count()) === 2, "activation asks for a password and its confirmation");
  check((await page.locator('input[name="token"][type="hidden"]').count()) === 1, "the token travels in the form body, not a new URL");
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  check(new URL(page.url()).pathname === "/get-started", "/register redirects to Get Started (no self-signup)");
  await page.goto(`${BASE}/activate?token=not-a-token`, { waitUntil: "networkidle" });
  check(await page.getByText("This link isn't valid").isVisible(), "/activate with a bad token shows a neutral message, no form");
  check((await page.locator('input[type="password"]').count()) === 0, "/activate with a bad token has no password form");
  const res = await page.request.post(`${BASE}/api/applications/documents`, { multipart: { case_id: "00000000-0000-4000-8000-000000000511", doc_type: "selfie", capture: "camera" } });
  check([401, 500, 503].includes(res.status()) && res.status() !== 200, `application upload without an application is refused (${res.status()})`);
  await page.goto(`${BASE}/preview/verification`, { waitUntil: "networkidle" });
  check((await page.locator('input[type="file"]').count()) === 0, "existing-account creator verification has no file input either");
  check((await page.locator("[data-camera-slot]").count()) === 3, "existing-account creator verification uses the camera slots");
  await ctx.close();
}

await browser.close();
console.log(`\n${passed} passed`);

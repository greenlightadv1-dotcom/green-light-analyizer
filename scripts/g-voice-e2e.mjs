#!/usr/bin/env node
/**
 * Browser check for G's voice loop, against a running build with the UI
 * preview on (no database, no microphone needed):
 *
 *   NEXT_PUBLIC_ENABLE_UI_PREVIEW=1 npm run build && npm run start -- -p 3668 &
 *   node scripts/g-voice-e2e.mjs [http://127.0.0.1:3668]
 *
 * What this is, and what it is not. It drives the real G panel in real
 * Chromium, but replaces the browser's SpeechRecognition with a fake that
 * follows the Web Speech spec's event order (abort() fires an "aborted" error,
 * then "end") and spies on speechSynthesis. So it verifies G's own state
 * machine, controls, messages and privacy behaviour. It does NOT verify
 * recognition accuracy, audio output, or any vendor speech service; those need
 * a person with a microphone (see the final report).
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.argv[2] ?? "http://127.0.0.1:3668";

const FAKE = () => {
  window.__voice = { starts: 0, langs: [], spoken: [], cancels: 0, gum: 0, rec: null };
  const md = navigator.mediaDevices;
  if (md?.getUserMedia) {
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = (...a) => { window.__voice.gum++; return orig(...a); };
  }
  class FakeRecognition {
    constructor() { this.lang = ""; this.onresult = this.onerror = this.onend = null; this.active = false; }
    start() { this.active = true; window.__voice.starts++; window.__voice.langs.push(this.lang); window.__voice.rec = this; }
    // Spec: abort() on an active session fires error("aborted") then end.
    abort() {
      if (!this.active) return;
      this.active = false;
      setTimeout(() => { this.onerror?.({ error: "aborted" }); this.onend?.(); }, 0);
    }
    stop() { this.abort(); }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
  // Say something: a final result, then (like Chrome with continuous=false) end.
  window.__say = (text) => {
    const r = window.__voice.rec;
    r.onresult?.({ results: [[{ transcript: text }]] });
    setTimeout(() => { if (r.active) { r.active = false; r.onend?.(); } }, 50);
  };
  window.__fail = (code) => { const r = window.__voice.rec; r.active = false; r.onerror?.({ error: code }); r.onend?.(); };
  const synth = window.speechSynthesis;
  synth.speak = (u) => { window.__voice.spoken.push(u.text); window.__voice.current = u; setTimeout(() => window.__voice.current === u && u.onend?.(), 1500); };
  synth.cancel = () => { window.__voice.cancels++; window.__voice.current = null; };
};

let passed = 0;
const ok = (m) => { passed++; console.log(`ok - ${m}`); };
const failures = [];
const check = async (name, fn) => {
  try { await fn(); ok(name); } catch (e) { failures.push(name); console.log(`not ok - ${name}\n    ${String(e.message).split("\n")[0]}`); }
};

const browser = await chromium.launch();
async function open(locale = "en", { fake = true, unsupported = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((l) => localStorage.setItem("greenlight-locale", l), locale);
  if (fake) await ctx.addInitScript(FAKE);
  if (unsupported) await ctx.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${BASE}/preview/dashboard`, { waitUntil: "networkidle" });
  await p.locator("button[aria-haspopup=dialog], button[aria-label*='G']").last().click();
  await p.locator("[role=dialog]").waitFor();
  return { p, ctx, errors, v: () => p.evaluate(() => ({ ...window.__voice, rec: undefined, current: undefined })) };
}
const status = (p) => p.locator("[role=dialog] [role=status]").allInnerTexts().then((a) => a.join(" | "));
const mic = (p, label) => p.locator(`[role=dialog] button[aria-label="${label}"]`);

try {
  // --- English: full loop ---------------------------------------------------
  {
    const { p, ctx, errors, v } = await open("en");
    await check("the microphone is never started without a click", async () => {
      const s = await v();
      assert.equal(s.starts, 0); assert.equal(s.gum, 0);
      assert.ok(await p.locator("[role=dialog]").innerText().then((t) => /stores no audio/.test(t)), "privacy notice shown before first use");
    });
    await check("pressing the mic starts listening with a visible indicator and a stop control", async () => {
      await mic(p, "Talk to G").click();
      assert.equal((await v()).starts, 1);
      assert.deepEqual((await v()).langs, ["en-US"]);
      assert.match(await status(p), /Listening/);
      assert.ok(await mic(p, "Stop").isVisible());
    });
    await check("recognised speech is sent to G and the answer is spoken", async () => {
      await p.evaluate(() => window.__say("How is my channel performing?"));
      await p.locator("[role=dialog]", { hasText: "How is my channel performing?" }).waitFor();
      await p.waitForFunction(() => window.__voice.spoken.length > 0, null, { timeout: 5000 });
      assert.match((await v()).spoken[0], /Preview/);
      assert.match(await status(p), /Speaking/);
      assert.ok(!/stopped unexpectedly/.test(await status(p)), "a successful turn must not show an error");
    });
    await check("pressing the mic while G speaks interrupts it and listens again", async () => {
      const before = (await v()).cancels;
      await mic(p, "Talk to G").click();
      assert.ok((await v()).cancels > before, "speech cancelled");
      assert.match(await status(p), /Listening/);
    });
    await check("Stop ends listening immediately and shows no error", async () => {
      await mic(p, "Stop").click();
      await p.waitForTimeout(200);
      assert.equal(await status(p), "", `status after stop: ${await status(p)}`);
      assert.ok(await mic(p, "Talk to G").isVisible());
    });
    await check("muting while speaking, then unmuting, speaks the next answer", async () => {
      await mic(p, "Talk to G").click();
      await p.evaluate(() => window.__say("What is missing from my media kit?"));
      await p.waitForFunction(() => window.__voice.spoken.length >= 2, null, { timeout: 5000 });
      await p.locator("[role=dialog] button[aria-pressed]").click(); // off, while speaking
      await p.locator("[role=dialog] button[aria-pressed]").click(); // on again
      await p.waitForTimeout(200);
      await mic(p, "Talk to G").click();
      await p.evaluate(() => window.__say("Summarize my deals."));
      await p.waitForFunction(() => window.__voice.spoken.length >= 3, null, { timeout: 5000 });
    });
    await check("with spoken replies off, answers are shown but not spoken", async () => {
      await p.waitForTimeout(1700);
      await p.locator("[role=dialog] button[aria-pressed]").click();
      const n = (await v()).spoken.length;
      await mic(p, "Talk to G").click();
      await p.evaluate(() => window.__say("Hello again"));
      await p.locator("[role=dialog]", { hasText: "Hello again" }).waitFor();
      await p.waitForTimeout(600);
      assert.equal((await v()).spoken.length, n);
      await p.locator("[role=dialog] button[aria-pressed]").click();
    });
    await check("switching to typing keeps the voice conversation", async () => {
      await p.locator("[role=dialog] textarea").fill("Typed follow-up");
      await p.keyboard.press("Enter");
      const text = await p.locator("[role=dialog]").innerText();
      for (const s of ["How is my channel performing?", "Summarize my deals.", "Typed follow-up"]) assert.ok(text.includes(s), s);
    });
    await check("navigating keeps the conversation and leaves the microphone off", async () => {
      await mic(p, "Talk to G").click();
      await p.goto(`${BASE}/preview/media-kit`, { waitUntil: "networkidle" });
      if (!(await p.locator("[role=dialog]").count())) await p.locator("button[aria-haspopup=dialog], button[aria-label*='G']").last().click();
      const text = await p.locator("[role=dialog]").innerText();
      assert.ok(text.includes("Typed follow-up"));
      assert.equal(await status(p), "", "not listening after navigation");
    });
    await check("no page errors during the English run", async () => assert.deepEqual(errors, []));
    await ctx.close();
  }

  // --- Arabic -------------------------------------------------------------------
  {
    const { p, ctx, v } = await open("ar");
    await check("Arabic: recognition uses ar-EG and the Arabic text reaches G", async () => {
      await mic(p, "تحدث مع G").click();
      assert.deepEqual((await v()).langs, ["ar-EG"]);
      await p.evaluate(() => window.__say("كيف أداء قناتي؟"));
      await p.locator("[role=dialog]", { hasText: "كيف أداء قناتي؟" }).waitFor();
      await p.waitForFunction(() => window.__voice.spoken.length > 0, null, { timeout: 5000 });
      assert.match(await status(p), /أتحدث/);
    });
    await ctx.close();
  }

  // --- Failures -------------------------------------------------------------
  for (const [code, re] of [["not-allowed", /blocked/], ["network", /needs a connection/], ["audio-capture", /stopped unexpectedly/]]) {
    const { p, ctx } = await open("en");
    await check(`speech error "${code}" shows a clear message and voice can be retried`, async () => {
      await mic(p, "Talk to G").click();
      await p.evaluate((c) => window.__fail(c), code);
      await p.waitForTimeout(100);
      assert.match(await status(p), re);
      await mic(p, "Talk to G").click();
      assert.match(await status(p), /Listening/);
    });
    await ctx.close();
  }
  {
    const { p, ctx } = await open("en");
    await check(`silence ("no-speech") returns to idle with a hint`, async () => {
      await mic(p, "Talk to G").click();
      await p.evaluate(() => window.__fail("no-speech"));
      await p.waitForTimeout(100);
      assert.match(await status(p), /didn't hear/);
      assert.ok(await mic(p, "Talk to G").isVisible());
    });
    await ctx.close();
  }
  {
    const { p, ctx } = await open("en");
    await check("a stalled speech service (no events at all) gives up after 15s instead of listening forever", async () => {
      await mic(p, "Talk to G").click();
      assert.match(await status(p), /Listening/);
      await p.waitForTimeout(16_000);
      assert.match(await status(p), /didn't hear/);
      assert.ok(await mic(p, "Talk to G").isVisible());
    });
    await check("speech output that never reports its end does not leave G stuck speaking", async () => {
      await p.evaluate(() => { window.speechSynthesis.speak = (u) => window.__voice.spoken.push(u.text); });
      await mic(p, "Talk to G").click();
      await p.evaluate(() => window.__say("Hello"));
      await p.waitForFunction(() => window.__voice.spoken.length > 0);
      assert.match(await status(p), /Speaking/);
      await p.waitForTimeout(9_000);
      assert.equal(await status(p), "");
    });
    await ctx.close();
  }
  {
    const { p, ctx } = await open("en", { fake: false, unsupported: true });
    await check("a browser without speech recognition gets no mic and a plain note; typing still works", async () => {
      assert.equal(await mic(p, "Talk to G").count(), 0);
      assert.match(await p.locator("[role=dialog]").innerText(), /isn't available in this browser/);
      await p.locator("[role=dialog] textarea").fill("typed only");
      await p.keyboard.press("Enter");
      await p.locator("[role=dialog]", { hasText: "typed only" }).waitFor();
    });
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);

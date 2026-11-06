#!/usr/bin/env node
/**
 * Browser check for opt-in "Hey G" activation, against a running build with
 * the UI preview on:
 *
 *   NEXT_PUBLIC_ENABLE_UI_PREVIEW=1 npm run build && npm run start -- -p 3668 &
 *   node scripts/g-wake-e2e.mjs [http://127.0.0.1:3668]
 *
 * It drives the real G panel in Chromium with a fake SpeechRecognition that
 * follows the Web Speech spec (continuous sessions, resultIndex/isFinal,
 * "aborted" on abort()), stubbed getUserMedia / permissions.query, and spies
 * on speechSynthesis and the WebAudio chime. It verifies G's behaviour, not
 * real recognition: no microphone or speech service is involved.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.argv[2] ?? "http://127.0.0.1:3668";

const FAKE = (cfg) => {
  window.__v = { recs: [], gum: 0, spoken: [], chimes: 0 };
  const mode = () => sessionStorage.getItem("__mic") ?? cfg.mic;
  const perm = () => sessionStorage.getItem("__perm") ?? cfg.perm;
  if (cfg.supported) {
    class FakeRec {
      constructor() { this.lang = ""; this.continuous = false; this.active = false; this.results = []; window.__v.recs.push(this); }
      start() { this.active = true; this.startedAt = Date.now(); }
      abort() {
        if (!this.active) return;
        this.active = false;
        setTimeout(() => { this.onerror?.({ error: "aborted" }); this.onend?.(); }, 0);
      }
      stop() { this.abort(); }
      deliver(text) {
        this.results.push(Object.assign([{ transcript: text }], { isFinal: true }));
        this.onresult?.({ resultIndex: this.results.length - 1, results: this.results });
      }
    }
    window.SpeechRecognition = FakeRec;
    window.webkitSpeechRecognition = FakeRec;
  } else {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  }
  const active = (continuous) => [...window.__v.recs].reverse().find((r) => r.active && r.continuous === continuous);
  window.__wakeRec = () => active(true) ?? null;
  window.__voiceRec = () => active(false) ?? null;
  window.__hear = (text) => { const r = active(true); if (!r) return false; r.deliver(text); return true; };
  window.__say = (text) => { const r = active(false); if (!r) return false; r.deliver(text); setTimeout(() => { if (r.active) { r.active = false; r.onend?.(); } }, 30); return true; };
  window.__failWake = (code) => { const r = active(true); r.active = false; r.onerror?.({ error: code }); r.onend?.(); };
  const md = navigator.mediaDevices ?? (navigator.mediaDevices = {});
  md.getUserMedia = async () => {
    window.__v.gum++;
    const m = mode();
    if (m === "deny") throw new DOMException("denied", "NotAllowedError");
    if (m === "none") throw new DOMException("no device", "NotFoundError");
    return { getTracks: () => [{ stop() {} }] };
  };
  if (navigator.permissions) navigator.permissions.query = async () => ({ state: perm() });
  window.speechSynthesis.speak = (u) => { window.__v.spoken.push(u.text); setTimeout(() => u.onend?.(), 300); };
  window.speechSynthesis.cancel = () => {};
  window.AudioContext = class { constructor() { window.__v.chimes++; this.currentTime = 0; this.destination = {}; }
    createGain() { return { gain: { value: 0 }, connect() {} }; }
    createOscillator() { return { frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; }
    close() { return Promise.resolve(); } };
};

let passed = 0;
const failures = [];
const check = async (name, fn) => {
  try { await fn(); passed++; console.log(`ok - ${name}`); } catch (e) { failures.push(name); console.log(`not ok - ${name}\n    ${String(e.message).split("\n")[0]}`); }
};

const browser = await chromium.launch();
async function session({ locale = "en", mic = "grant", perm = "granted", supported = true, viewport = { width: 1280, height: 900 }, reducedMotion } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion });
  await ctx.addInitScript((l) => localStorage.setItem("greenlight-locale", l), locale);
  await ctx.addInitScript(FAKE, { mic, perm, supported });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${BASE}/preview/dashboard`, { waitUntil: "networkidle" });
  return { p, ctx, errors, v: () => p.evaluate(() => ({ gum: window.__v.gum, spoken: window.__v.spoken.length, chimes: window.__v.chimes, recs: window.__v.recs.length, wake: !!window.__wakeRec(), voice: !!window.__voiceRec(), wakeLang: window.__wakeRec()?.lang ?? null })) };
}
const dialog = (p) => p.locator("[role=dialog]");
const openPanel = async (p) => { if (!(await dialog(p).count())) await p.locator(`button[aria-label^="Open G"], button[aria-label^="افتح G"]`).click(); await dialog(p).waitFor(); };
const closePanel = async (p) => { await p.keyboard.press("Escape"); await p.waitForTimeout(150); };
const indicator = (p) => p.locator("[data-testid=g-wake-indicator]");
const enableWake = async (p, label = "Enable “Hey G” voice activation", allow = "Allow microphone and turn on") => {
  await openPanel(p);
  await p.getByRole("switch", { name: label }).click();
  await p.getByRole("button", { name: allow }).click();
  await p.waitForFunction(() => !!window.__wakeRec());
};
const waitWakeAgain = (p, ms = 6000) => p.waitForFunction(() => !!window.__wakeRec(), null, { timeout: ms });

try {
  // ---------------------------------------------------------------- English
  {
    const { p, ctx, errors, v } = await session();
    await check("off by default: no recognizer, no microphone request, no indicator", async () => {
      await p.waitForTimeout(500);
      const s = await v();
      assert.equal(s.recs, 0); assert.equal(s.gum, 0);
      assert.equal(await indicator(p).count(), 0);
      await openPanel(p);
      assert.ok(await p.getByRole("switch", { name: "Enable “Hey G” voice activation" }).isVisible());
    });
    await check("enabling explains the microphone, external processing and how to turn it off; Cancel changes nothing", async () => {
      await p.getByRole("switch", { name: "Enable “Hey G” voice activation" }).click();
      const text = await dialog(p).innerText();
      for (const re of [/microphone access/, /browser vendor's servers/, /stores no recordings or transcripts/, /Turn off/, /not always-on/, /Hey G · Hello G/]) assert.match(text, re);
      await p.getByRole("button", { name: "Not now" }).click();
      const s = await v();
      assert.equal(s.recs, 0); assert.equal(s.gum, 0);
    });
    await check("allowing requests the microphone once and starts listening in the site language", async () => {
      await p.getByRole("switch", { name: "Enable “Hey G” voice activation" }).click();
      await p.getByRole("button", { name: "Allow microphone and turn on" }).click();
      await p.waitForFunction(() => !!window.__wakeRec());
      const s = await v();
      assert.equal(s.gum, 1); assert.equal(s.wakeLang, "en-US");
    });
    await check("a persistent indicator with Turn off is visible with the panel open and closed", async () => {
      assert.match(await indicator(p).first().innerText(), /Listening for “Hey G”/);
      await closePanel(p);
      assert.ok(await indicator(p).isVisible());
      assert.ok(await indicator(p).getByRole("button", { name: "Turn off" }).isVisible());
    });
    await check("ordinary speech does not wake G and is not kept anywhere", async () => {
      for (const s of ["hey guys what's up", "hello there", "I said hey G to him"]) await p.evaluate((t) => window.__hear(t), s);
      await p.waitForTimeout(300);
      assert.equal(await dialog(p).count(), 0, "panel stayed closed");
      assert.ok((await v()).wake, "still listening");
      const stored = await p.evaluate(() => JSON.stringify(Object.values(sessionStorage)) + JSON.stringify(Object.values(localStorage)));
      assert.ok(!stored.includes("hey guys"), "background speech not stored");
    });
    await check("“Hey G” opens G with a wake animation and chime, then listens for the question", async () => {
      const before = await v();
      await p.evaluate(() => window.__hear("Hey G"));
      await dialog(p).waitFor();
      assert.ok(await p.locator('[role=dialog] [data-g-state="wake"]').count(), "wake animation");
      assert.match(await dialog(p).locator("[role=status]").last().innerText(), /I'm here/);
      assert.equal((await v()).chimes, before.chimes + 1);
      await p.waitForFunction(() => !!window.__voiceRec(), null, { timeout: 2000 });
      assert.ok(!(await v()).wake, "wake listener stepped aside");
    });
    await check("the next sentence is the question; the wake phrase is never sent", async () => {
      await p.evaluate(() => window.__say("How is my channel performing?"));
      await dialog(p).getByText("How is my channel performing?").waitFor();
      const msgs = await dialog(p).locator(".ms-8").allInnerTexts();
      assert.ok(!msgs.some((m) => /hey g/i.test(m)), `messages: ${msgs}`);
      await p.waitForFunction(() => window.__v.spoken.length > 0);
    });
    await check("after G answers, wake listening resumes", async () => { await waitWakeAgain(p); });
    await check("a repeat inside the cooldown does not re-activate", async () => {
      await p.waitForTimeout(4200); // clear the previous activation's cooldown
      await waitWakeAgain(p);
      await p.evaluate(() => window.__hear("Hello G"));
      await p.waitForFunction(() => !!window.__voiceRec(), null, { timeout: 2000 }); // activated
      await p.getByRole("button", { name: "Stop" }).click();
      await waitWakeAgain(p); // listener back well inside the 4s cooldown
      const recs = (await v()).recs;
      await p.evaluate(() => window.__hear("Hello G"));
      await p.waitForTimeout(500);
      const s2 = await v();
      assert.equal(s2.voice, false, "no new voice turn started");
      assert.ok(s2.recs <= recs + 1, "at most the wake listener restarted");
    });
    await check("“Hello G, …” in one breath sends only the question", async () => {
      await p.waitForTimeout(4200);
      await waitWakeAgain(p);
      await p.evaluate(() => window.__hear("Hello G, summarize my deals"));
      await dialog(p).getByText("summarize my deals", { exact: true }).waitFor();
      assert.equal(await dialog(p).getByText("Hello G, summarize my deals").count(), 0);
    });
    await check("switching to typing keeps the voice conversation", async () => {
      await dialog(p).locator("textarea").fill("Typed follow-up");
      await p.keyboard.press("Enter");
      const text = await dialog(p).innerText();
      for (const s of ["How is my channel performing?", "summarize my deals", "Typed follow-up"]) assert.ok(text.includes(s), s);
    });
    await check("navigating keeps the conversation and resumes listening only with permission still granted", async () => {
      const gum = (await v()).gum;
      await p.goto(`${BASE}/preview/media-kit`, { waitUntil: "networkidle" });
      await waitWakeAgain(p);
      assert.equal((await v()).gum, 0, "no new microphone prompt on this page");
      await openPanel(p);
      assert.match(await dialog(p).innerText(), /Typed follow-up/);
      assert.ok(gum >= 1);
    });
    await check("a hidden tab stops listening; visible again resumes", async () => {
      await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
      await p.waitForTimeout(200);
      assert.ok(!(await v()).wake);
      await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
      await waitWakeAgain(p);
    });
    await check("Turn off stops listening at once and forgets the opt-in", async () => {
      await indicator(p).first().getByRole("button", { name: "Turn off" }).click();
      await p.waitForTimeout(100);
      assert.ok(!(await v()).wake);
      assert.equal(await indicator(p).count(), 0);
      assert.equal(await p.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("gl:g:wake")).length), 0);
    });
    await check("signing out stops listening and clears G's session data", async () => {
      await enableWake(p);
      await closePanel(p);
      await p.getByRole("button", { name: "Sign out" }).click();
      await p.waitForTimeout(150);
      assert.ok(!(await v()).wake);
      assert.equal(await indicator(p).count(), 0);
      assert.equal(await p.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("gl:g:")).length), 0);
    });
    await check("the speech service revoking permission mid-session turns it off with an explanation", async () => {
      await enableWake(p);
      await p.evaluate(() => window.__failWake("not-allowed"));
      await p.waitForTimeout(100);
      assert.ok(!(await v()).wake);
      assert.match(await dialog(p).innerText(), /Microphone access was blocked/);
    });
    await check("no page errors in the English run", async () => assert.deepEqual(errors, []));
    await ctx.close();
  }

  // -------------------------------------------- refresh / new session rules
  {
    const { p, ctx, v } = await session({ perm: "prompt" });
    await check("after a refresh without granted permission, it waits for Resume instead of listening", async () => {
      await enableWake(p);
      await p.reload({ waitUntil: "networkidle" });
      await p.waitForTimeout(400);
      assert.ok(!(await v()).wake, "not listening after refresh");
      const resume = p.getByRole("button", { name: "Resume" }).first();
      assert.ok(await resume.isVisible());
      await resume.click();
      await waitWakeAgain(p);
      assert.equal((await v()).gum, 1, "permission asked again on Resume");
    });
    await ctx.close();
    const fresh = await session();
    await check("a new browser session starts with it off", async () => {
      await fresh.p.waitForTimeout(400);
      assert.equal((await fresh.v()).recs, 0);
      assert.equal(await indicator(fresh.p).count(), 0);
    });
    await fresh.ctx.close();
  }

  // ---------------------------------------------------------------- Arabic
  {
    const { p, ctx, v } = await session({ locale: "ar" });
    await check("Arabic: listens in ar-EG", async () => {
      await enableWake(p, "تفعيل التنشيط الصوتي «Hey G»", "السماح بالميكروفون والتشغيل");
      assert.equal((await v()).wakeLang, "ar-EG");
      await closePanel(p);
    });
    for (const phrase of ["يا جي", "أهلًا جي", "أهلاً يا G", "هاي جي"]) {
      await check(`Arabic: “${phrase}” opens G and listens for the question`, async () => {
        await waitWakeAgain(p, 9000);
        await p.waitForTimeout(4100); // cooldown from the previous activation
        await p.evaluate((t) => window.__hear(t), phrase);
        await dialog(p).waitFor();
        await p.waitForFunction(() => !!window.__voiceRec(), null, { timeout: 2000 });
        await p.getByRole("button", { name: "إيقاف" }).last().click();
        await closePanel(p);
      });
    }
    await check("Arabic: wake phrase with the question sends only the question", async () => {
      await waitWakeAgain(p, 9000);
      await p.waitForTimeout(4100);
      await p.evaluate(() => window.__hear("يا جي لخص صفقاتي"));
      await dialog(p).getByText("لخص صفقاتي", { exact: true }).waitFor();
    });
    await check("Arabic: “يا جماعة” does not wake G", async () => {
      await closePanel(p);
      await waitWakeAgain(p, 9000);
      await p.evaluate(() => window.__hear("يا جماعة"));
      await p.waitForTimeout(300);
      assert.equal(await dialog(p).count(), 0);
    });
    await ctx.close();
  }

  // ---------------------------------------------------------------- failures
  for (const [mic, re] of [["deny", /Microphone access was blocked/], ["none", /No usable microphone/]]) {
    const { p, ctx, v } = await session({ mic });
    await check(`microphone ${mic === "deny" ? "permission denied" : "unavailable"}: explained, stays off, manual voice still offered`, async () => {
      await openPanel(p);
      await p.getByRole("switch", { name: "Enable “Hey G” voice activation" }).click();
      await p.getByRole("button", { name: "Allow microphone and turn on" }).click();
      await dialog(p).getByRole("alert").waitFor();
      assert.match(await dialog(p).innerText(), re);
      assert.ok(!(await v()).wake);
      assert.equal(await indicator(p).count(), 0);
      assert.ok(await p.getByRole("button", { name: "Talk to G" }).isVisible());
    });
    await ctx.close();
  }
  {
    const { p, ctx } = await session({ supported: false });
    await check("unsupported browser: the setting is disabled with an explanation; button and typing remain", async () => {
      await openPanel(p);
      assert.ok(await p.getByRole("switch", { name: "Enable “Hey G” voice activation" }).isDisabled());
      assert.match(await dialog(p).innerText(), /no speech recognition/);
      await dialog(p).locator("textarea").fill("typed");
      await p.keyboard.press("Enter");
      await dialog(p).getByText("typed", { exact: true }).waitFor();
    });
    await ctx.close();
  }

  // ---------------------------------------------------------------- mobile + motion
  {
    const { p, ctx } = await session({ viewport: { width: 390, height: 844 } });
    await check("mobile: indicator visible, wake opens the panel, no horizontal scroll", async () => {
      await enableWake(p);
      await closePanel(p);
      assert.ok(await indicator(p).isVisible());
      await p.evaluate(() => window.__hear("Hey G"));
      await dialog(p).waitFor();
      const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      assert.ok(sw <= iw + 1, `${sw} > ${iw}`);
    });
    await ctx.close();
  }
  {
    const { p, ctx } = await session({ reducedMotion: "reduce" });
    await check("reduced motion: G's animations are flattened", async () => {
      await openPanel(p);
      const d = await p.evaluate(() => getComputedStyle(document.querySelector(".g-panel-in")).animationDuration);
      assert.ok(parseFloat(d) < 0.001, `animation-duration ${d}`);
    });
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);

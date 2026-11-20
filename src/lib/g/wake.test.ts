import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  WAKE_COOLDOWN_MS,
  WAKE_PHRASES,
  classifyMicError,
  classifyWakeError,
  isQuestion,
  matchWake,
  mayActivate,
  wakeKey,
} from "./wake.ts";

/** "Hey G" wake phrases: every supported phrase, its spellings, and no false wakes. */

test("every supported phrase, exactly as written, wakes G with no question", () => {
  for (const [id, text] of Object.entries(WAKE_PHRASES)) {
    assert.deepEqual(matchWake(text), { phrase: id, remainder: "" }, text);
  }
});

test("recognizer spellings, punctuation, case and Arabic diacritics are tolerated", () => {
  const cases: [string, string][] = [
    ["hey g", "hey_g"],
    ["Hey, G.", "hey_g"],
    ["HEY GEE", "hey_g"],
    ["hey jee", "hey_g"],
    ["Hello G!", "hello_g"],
    ["hello gee", "hello_g"],
    ["هاي جي", "hey_g"],
    ["أهلا جي", "ahlan_g"],
    ["اهلاً G", "ahlan_g"],
    ["أهلًا يا جي", "ahlan_ya_g"],
    ["اهلا يا G؟", "ahlan_ya_g"],
    ["يا جي", "ya_g"],
    ["يا G،", "ya_g"],
  ];
  for (const [text, id] of cases) assert.equal(matchWake(text)?.phrase, id, text);
});

test("a question said in the same breath is returned without the wake phrase", () => {
  assert.deepEqual(matchWake("Hey G, how is my channel performing?"), { phrase: "hey_g", remainder: "how is my channel performing?" });
  assert.deepEqual(matchWake("يا جي كيف أداء قناتي؟"), { phrase: "ya_g", remainder: "كيف أداء قناتي؟" });
  assert.deepEqual(matchWake("أهلاً يا G، لخص صفقاتي"), { phrase: "ahlan_ya_g", remainder: "لخص صفقاتي" });
});

test("ordinary speech never wakes G", () => {
  for (const text of [
    "hey guys",
    "hey",
    "G",
    "I said hey G to him",
    "they g",
    "hello there",
    "يا جماعة",
    "يا",
    "أهلا وسهلا",
    "قلت يا جي",
    "the G is silent",
    "",
  ]) {
    assert.equal(matchWake(text), null, text);
  }
});

test("the same result never activates twice, and a repeat inside the cooldown is ignored", () => {
  assert.ok(mayActivate({ now: 1000, lastWakeAt: null, resultKey: "s1:0", lastResultKey: null }));
  assert.ok(!mayActivate({ now: 99_999, lastWakeAt: 0, resultKey: "s1:0", lastResultKey: "s1:0" }));
  assert.ok(!mayActivate({ now: 1000 + WAKE_COOLDOWN_MS - 1, lastWakeAt: 1000, resultKey: "s2:0", lastResultKey: "s1:0" }));
  assert.ok(mayActivate({ now: 1000 + WAKE_COOLDOWN_MS, lastWakeAt: 1000, resultKey: "s2:0", lastResultKey: "s1:0" }));
});

test("only a real remainder counts as a question", () => {
  assert.ok(!isQuestion(""));
  assert.ok(!isQuestion("uh"));
  assert.ok(isQuestion("how is my channel"));
  assert.ok(isQuestion("لخص صفقاتي"));
});

test("errors map to denied, unavailable, network or keep-listening", () => {
  assert.equal(classifyWakeError("not-allowed"), "denied");
  assert.equal(classifyWakeError("service-not-allowed"), "denied");
  assert.equal(classifyWakeError("audio-capture"), "unavailable");
  assert.equal(classifyWakeError("network"), "network");
  assert.equal(classifyWakeError("no-speech"), "transient");
  assert.equal(classifyWakeError("aborted"), "transient");
  assert.equal(classifyMicError("NotAllowedError"), "denied");
  assert.equal(classifyMicError("NotFoundError"), "unavailable");
  assert.equal(classifyMicError(undefined), "unavailable");
});

test("the opt-in is scoped to one user", () => {
  assert.notEqual(wakeKey("a"), wakeKey("b"));
  assert.ok(wakeKey("a").startsWith("gl:g:"), "cleared with the rest of G's session data at sign-out");
});

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { initialVoiceState, voiceReducer, type VoiceEvent, type VoiceState } from "./voice.ts";

/** G voice: explicit start, interruption, stop, mute, denial and unsupported fallback. */

function run(state: VoiceState, events: VoiceEvent[]) {
  const effects: string[] = [];
  for (const e of events) {
    const r = voiceReducer(state, e);
    state = r.state;
    effects.push(...r.effects.map((x) => x.type));
  }
  return { state, effects };
}

const ready = initialVoiceState(true, true);

test("a full turn: start, hear, send, reply spoken, done", () => {
  const r = run(ready, [{ type: "start" }, { type: "heard", text: " how is my channel " }, { type: "reply", text: "Here is…" }, { type: "speech_done" }]);
  assert.equal(r.state.phase, "idle");
  assert.deepEqual(r.effects, ["start_recognition", "stop_recognition", "send", "cancel_speech", "speak"]);
});

test("the microphone only opens on an explicit start", () => {
  for (const e of [{ type: "heard", text: "x" }, { type: "reply", text: "x" }, { type: "speech_done" }, { type: "recognition_ended" }] as VoiceEvent[]) {
    const r = voiceReducer(ready, e);
    assert.notEqual(r.state.phase, "listening");
    assert.ok(!r.effects.some((x) => x.type === "start_recognition"));
  }
});

test("starting to talk interrupts G while it is speaking", () => {
  const speaking = run(ready, [{ type: "start" }, { type: "heard", text: "q" }, { type: "reply", text: "long answer" }]).state;
  assert.equal(speaking.phase, "speaking");
  const r = voiceReducer(speaking, { type: "start" });
  assert.equal(r.state.phase, "listening");
  assert.deepEqual(r.effects.map((e) => e.type), ["cancel_speech", "start_recognition"]);
});

test("stop cancels listening and speech together", () => {
  const r = voiceReducer({ ...ready, phase: "speaking" }, { type: "stop" });
  assert.equal(r.state.phase, "idle");
  assert.deepEqual(r.effects.map((e) => e.type), ["stop_recognition", "cancel_speech"]);
});

test("mute silences the current reply and later replies, text still arrives", () => {
  let r = voiceReducer({ ...ready, phase: "speaking" }, { type: "toggle_mute" });
  assert.deepEqual([r.state.phase, r.state.muted, r.effects[0]?.type], ["idle", true, "cancel_speech"]);
  const muted = run(r.state, [{ type: "start" }, { type: "heard", text: "q" }, { type: "reply", text: "answer" }]);
  assert.equal(muted.state.phase, "idle");
  assert.ok(!muted.effects.includes("speak"));
  r = voiceReducer(muted.state, { type: "toggle_mute" });
  assert.equal(r.state.muted, false);
});

test("microphone denial is an error with a reason; the text box is unaffected", () => {
  const r = run(ready, [{ type: "start" }, { type: "recognition_error", error: "not-allowed" }]);
  assert.deepEqual([r.state.phase, r.state.error], ["error", "denied"]);
});

test("an unsupported browser never tries to listen", () => {
  const r = voiceReducer(initialVoiceState(false, true), { type: "start" });
  assert.deepEqual([r.state.phase, r.state.error, r.effects.length], ["error", "unsupported", 0]);
});

test("silence or an empty transcript returns to idle without sending", () => {
  assert.equal(run(ready, [{ type: "start" }, { type: "recognition_error", error: "no-speech" }]).state.phase, "idle");
  const r = run(ready, [{ type: "start" }, { type: "heard", text: "   " }]);
  assert.equal(r.state.phase, "idle");
  assert.ok(!r.effects.includes("send"));
});

test("no speech output without a speech engine, or when the reply has no text", () => {
  const noTts = run(initialVoiceState(true, false), [{ type: "start" }, { type: "heard", text: "q" }, { type: "reply", text: "a" }]);
  assert.ok(!noTts.effects.includes("speak"));
  const empty = run(ready, [{ type: "start" }, { type: "heard", text: "q" }, { type: "reply", text: null }]);
  assert.equal(empty.state.phase, "idle");
});

test("our own abort is not an error: Stop and a heard turn stay clean (spec fires 'aborted')", () => {
  const stopped = run(ready, [{ type: "start" }, { type: "stop" }, { type: "recognition_error", error: "aborted" }, { type: "recognition_ended" }]);
  assert.equal(stopped.state.phase, "idle");
  assert.equal(stopped.state.error, null);
  const heard = run(ready, [{ type: "start" }, { type: "heard", text: "hello" }, { type: "recognition_error", error: "aborted" }, { type: "reply", text: "Hi" }]);
  assert.equal(heard.state.phase, "speaking", "the answer is still spoken");
  assert.equal(heard.state.error, null);
});

test("a late error from a finished session cannot clobber processing", () => {
  const r = run(ready, [{ type: "start" }, { type: "heard", text: "hello" }, { type: "recognition_error", error: "network" }]);
  assert.equal(r.state.phase, "processing");
  assert.equal(r.state.error, null);
});

test("a question from the wake listener is sent as a voice turn and its answer spoken", () => {
  const r = run(ready, [{ type: "external", text: "how is my channel" }, { type: "reply", text: "Here" }]);
  assert.equal(r.state.phase, "speaking");
  assert.deepEqual(r.effects, ["stop_recognition", "send", "cancel_speech", "speak"]);
  assert.equal(run(ready, [{ type: "external", text: "  " }]).state.phase, "idle", "nothing to send");
});

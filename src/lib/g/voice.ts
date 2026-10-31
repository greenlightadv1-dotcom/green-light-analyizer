/**
 * G's voice conversation state (feature 7C), as a pure reducer so the rules
 * are testable without a browser:
 *
 *   idle ──start──▶ listening ──heard──▶ processing ──reply──▶ speaking ──done──▶ idle
 *
 * - The microphone opens only on an explicit `start` (a user click). Nothing
 *   in this machine reaches `listening` any other way.
 * - `start` while G is speaking interrupts it: speech is cancelled first.
 * - `stop` cancels everything at once: listening, waiting and speaking.
 * - Microphone denial or an unsupported browser lands in `error` with a
 *   reason, and the text box keeps working.
 * - `muted` silences spoken replies without leaving voice mode.
 *
 * The effects (start recognition, cancel speech, speak) are returned as data;
 * the hook in components/g/useVoice.ts performs them with the browser's Web
 * Speech API. No audio is recorded or stored by Green Light.
 *
 * Pure — unit-tested in voice.test.ts.
 */

export type VoicePhase = "idle" | "listening" | "processing" | "speaking" | "error";
export type VoiceError = "unsupported" | "denied" | "no_speech" | "network" | "failed";

export type VoiceState = {
  phase: VoicePhase;
  muted: boolean;
  error: VoiceError | null;
  canListen: boolean;
  canSpeak: boolean;
};

export type VoiceEvent =
  | { type: "start" }
  | { type: "heard"; text: string }
  /** A question heard elsewhere (the "Hey G" listener), sent as a voice turn. */
  | { type: "external"; text: string }
  | { type: "recognition_ended" }
  | { type: "recognition_error"; error: string }
  | { type: "reply"; text: string | null }
  | { type: "speech_done" }
  | { type: "stop" }
  | { type: "toggle_mute" };

export type VoiceEffect =
  | { type: "cancel_speech" }
  | { type: "start_recognition" }
  | { type: "stop_recognition" }
  | { type: "send"; text: string }
  | { type: "speak"; text: string };

export function initialVoiceState(canListen: boolean, canSpeak: boolean): VoiceState {
  return { phase: "idle", muted: false, error: null, canListen, canSpeak };
}

function mapError(e: string): VoiceError {
  if (e === "not-allowed" || e === "service-not-allowed") return "denied";
  if (e === "no-speech") return "no_speech";
  if (e === "network") return "network";
  return "failed";
}

export function voiceReducer(state: VoiceState, event: VoiceEvent): { state: VoiceState; effects: VoiceEffect[] } {
  switch (event.type) {
    case "start": {
      if (!state.canListen) return { state: { ...state, phase: "error", error: "unsupported" }, effects: [] };
      const effects: VoiceEffect[] = [];
      // Interrupt: the user starting to talk always cuts G off.
      if (state.phase === "speaking") effects.push({ type: "cancel_speech" });
      effects.push({ type: "start_recognition" });
      return { state: { ...state, phase: "listening", error: null }, effects };
    }
    case "heard": {
      if (state.phase !== "listening") return { state, effects: [] };
      const text = event.text.trim();
      if (!text) return { state: { ...state, phase: "idle" }, effects: [{ type: "stop_recognition" }] };
      return { state: { ...state, phase: "processing" }, effects: [{ type: "stop_recognition" }, { type: "send", text }] };
    }
    case "external": {
      const text = event.text.trim();
      if (!text || state.phase === "processing") return { state, effects: [] };
      const effects: VoiceEffect[] = [{ type: "stop_recognition" }];
      if (state.phase === "speaking") effects.push({ type: "cancel_speech" });
      effects.push({ type: "send", text });
      return { state: { ...state, phase: "processing", error: null }, effects };
    }
    case "recognition_ended":
      // Ended without a result (silence, or the browser's own timeout).
      return state.phase === "listening" ? { state: { ...state, phase: "idle" }, effects: [] } : { state, effects: [] };
    case "recognition_error": {
      // "aborted" is our own stop or interrupt (the spec fires it on abort()),
      // and an error after listening has ended belongs to a finished session:
      // neither may turn a successful or deliberately stopped turn into an error.
      if (event.error === "aborted" || state.phase !== "listening") return { state, effects: [] };
      const error = mapError(event.error);
      // Also raised by the client's listening watchdog, when the browser's
      // session is still open: close it either way.
      if (error === "no_speech") return { state: { ...state, phase: "idle", error }, effects: [{ type: "stop_recognition" }] };
      return { state: { ...state, phase: "error", error }, effects: [{ type: "stop_recognition" }] };
    }
    case "reply": {
      if (state.phase !== "processing") return { state, effects: [] };
      if (!event.text || state.muted || !state.canSpeak) return { state: { ...state, phase: "idle" }, effects: [] };
      return { state: { ...state, phase: "speaking" }, effects: [{ type: "cancel_speech" }, { type: "speak", text: event.text }] };
    }
    case "speech_done":
      return state.phase === "speaking" ? { state: { ...state, phase: "idle" }, effects: [] } : { state, effects: [] };
    case "stop":
      return {
        state: { ...state, phase: "idle", error: null },
        effects: [{ type: "stop_recognition" }, { type: "cancel_speech" }],
      };
    case "toggle_mute": {
      const muted = !state.muted;
      const effects: VoiceEffect[] = muted && state.phase === "speaking" ? [{ type: "cancel_speech" }] : [];
      return { state: { ...state, muted, phase: muted && state.phase === "speaking" ? "idle" : state.phase }, effects };
    }
  }
}

/** BCP-47 tags for the browser speech services, per app locale. */
export const SPEECH_LANG: Record<string, string> = {
  en: "en-US",
  ar: "ar-EG",
  fr: "fr-FR",
  es: "es-ES",
  de: "de-DE",
};

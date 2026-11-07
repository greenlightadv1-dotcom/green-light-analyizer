"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  SPEECH_LANG,
  initialVoiceState,
  voiceReducer,
  type VoiceEffect,
  type VoiceEvent,
  type VoiceState,
} from "@/lib/g/voice";

/**
 * Browser speech for G, driven by the pure reducer in lib/g/voice.ts.
 *
 * Speech-to-text uses the browser's SpeechRecognition and text-to-speech its
 * speechSynthesis. Green Light records nothing and stores no audio. Some
 * browsers (Chrome among them) send the audio to the browser vendor's speech
 * service to transcribe it; the panel says so before the first use. Where the
 * browser has no SpeechRecognition, the microphone is not offered at all.
 */

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};
/** "LS": can listen / can speak, as a stable string for useSyncExternalStore. */
function capability(): string {
  const listen = recognitionCtor() ? "1" : "0";
  const speak = typeof window !== "undefined" && "speechSynthesis" in window ? "1" : "0";
  return listen + speak;
}

const LISTEN_TIMEOUT_MS = 15_000;
/** Generous: about 2.5 words a second, plus slack, never under 8s. */
const speakTimeoutMs = (text: string) => Math.max(8_000, text.split(/\s+/).length * 400 + 4_000);

export function useVoice(locale: string, onSend: (text: string) => void) {
  const caps = useSyncExternalStore(noop, capability, () => "00");
  const canListen = caps[0] === "1";
  const canSpeak = caps[1] === "1";
  const [state, setState] = useState<VoiceState>(() => initialVoiceState(false, false));
  const stateRef = useRef(state);
  const recRef = useRef<Recognition | null>(null);
  // Watchdogs. A browser speech service can stall without ever firing a
  // result, error or end event (headless Chromium does; a hung vendor service
  // can too), and speechSynthesis may never fire onend when no voice is
  // installed. Neither may leave G stuck "Listening…" or "Speaking…".
  const listenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = (ref: { current: ReturnType<typeof setTimeout> | null }) => {
    if (ref.current) clearTimeout(ref.current);
    ref.current = null;
  };
  const sendRef = useRef(onSend);
  useEffect(() => {
    sendRef.current = onSend;
  }, [onSend]);

  // Recognition and speech callbacks fire later, so they reach the current
  // dispatcher through a ref rather than a closure over an older one.
  const dispatchRef = useRef<(e: VoiceEvent) => void>(() => {});

  const run = useCallback(
    (effects: VoiceEffect[]) => {
      const dispatch = (e: VoiceEvent) => dispatchRef.current(e);
      for (const effect of effects) {
        switch (effect.type) {
          case "cancel_speech":
            clear(speakTimer);
            if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
            break;
          case "stop_recognition": {
            // Detach first: per the Web Speech spec, abort() fires an
            // "aborted" error and an "end" event. Those describe our own
            // stop, not a failure, and must not reach the reducer.
            clear(listenTimer);
            const rec = recRef.current;
            recRef.current = null;
            if (rec) {
              rec.onresult = null;
              rec.onerror = null;
              rec.onend = null;
              rec.abort();
            }
            break;
          }
          case "start_recognition": {
            const Ctor = recognitionCtor();
            if (!Ctor) break;
            const rec = new Ctor();
            rec.lang = SPEECH_LANG[locale] ?? "en-US";
            rec.interimResults = false;
            rec.continuous = false;
            rec.maxAlternatives = 1;
            rec.onresult = (e) => {
              clear(listenTimer);
              dispatch({ type: "heard", text: e.results[0]?.[0]?.transcript ?? "" });
            };
            rec.onerror = (e) => {
              clear(listenTimer);
              dispatch({ type: "recognition_error", error: e.error });
            };
            rec.onend = () => {
              clear(listenTimer);
              dispatch({ type: "recognition_ended" });
            };
            recRef.current = rec;
            clear(listenTimer);
            listenTimer.current = setTimeout(() => {
              if (recRef.current === rec) dispatch({ type: "recognition_error", error: "no-speech" });
            }, LISTEN_TIMEOUT_MS);
            try {
              rec.start();
            } catch {
              dispatch({ type: "recognition_error", error: "failed" });
            }
            break;
          }
          case "speak": {
            const synth = window.speechSynthesis;
            const utterance = new SpeechSynthesisUtterance(effect.text);
            const lang = SPEECH_LANG[locale] ?? "en-US";
            utterance.lang = lang;
            const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2)));
            if (voice) utterance.voice = voice;
            utterance.onend = () => {
              clear(speakTimer);
              dispatch({ type: "speech_done" });
            };
            utterance.onerror = () => {
              clear(speakTimer);
              dispatch({ type: "speech_done" });
            };
            synth.speak(utterance);
            clear(speakTimer);
            speakTimer.current = setTimeout(() => dispatch({ type: "speech_done" }), speakTimeoutMs(effect.text));
            break;
          }
          case "send":
            sendRef.current(effect.text);
            break;
        }
      }
    },
    [locale],
  );

  const dispatch = useCallback(
    (event: VoiceEvent) => {
      const current = { ...stateRef.current, canListen, canSpeak };
      const { state: next, effects } = voiceReducer(current, event);
      stateRef.current = next;
      setState(next);
      run(effects);
    },
    [canListen, canSpeak, run],
  );
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  // Leaving the page or closing G must never leave the microphone open.
  useEffect(
    () => () => {
      clear(listenTimer);
      clear(speakTimer);
      const rec = recRef.current;
      if (rec) {
        rec.onresult = rec.onerror = null;
        rec.onend = null;
        rec.abort();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

  return {
    ...state,
    canListen,
    canSpeak,
    start: () => dispatch({ type: "start" }),
    ask: (text: string) => dispatch({ type: "external", text }),
    stop: () => dispatch({ type: "stop" }),
    toggleMute: () => dispatch({ type: "toggle_mute" }),
    replied: (text: string | null) => dispatch({ type: "reply", text }),
  };
}

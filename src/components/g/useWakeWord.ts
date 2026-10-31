"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SPEECH_LANG } from "@/lib/g/voice";
import {
  classifyMicError,
  classifyWakeError,
  isQuestion,
  matchWake,
  mayActivate,
  WAKE_COOLDOWN_MS,
  wakeKey,
} from "@/lib/g/wake";
import { G_EVENT, type GEventDetail } from "./events";

/**
 * Opt-in "Hey G" listening. OFF unless the person turns it on.
 *
 * - Turning it on asks the browser for microphone permission first
 *   (getUserMedia; the stream is closed at once, it only proves consent).
 * - The opt-in is remembered for this tab and this user only (sessionStorage),
 *   and is resumed after a navigation or refresh only while the browser still
 *   reports the microphone as granted. A new session starts with it off.
 * - Recognition runs only while the page is visible and G is not already in a
 *   voice turn. Heard speech is matched in memory and dropped: nothing is
 *   stored, logged or sent anywhere, and nothing reaches the AI model unless
 *   it followed a wake phrase.
 * - Browsers end continuous recognition on their own from time to time; it is
 *   restarted, with a cap so a failing service cannot loop.
 */

export type WakeStatus =
  | "off"
  | "listening" // recognizer open, waiting for a wake phrase
  | "paused" // on, but not listening right now (tab hidden, G busy, or needs Resume)
  | "needs_resume" // opted in this session, but permission must be confirmed again
  | "denied"
  | "unavailable"
  | "network"
  | "unsupported";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
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
const supportedSnapshot = () => (recognitionCtor() && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia ? "1" : "0");

function readOptIn(userId: string): boolean {
  try {
    return sessionStorage.getItem(wakeKey(userId)) === "1";
  } catch {
    return false;
  }
}
function writeOptIn(userId: string, on: boolean) {
  try {
    if (on) sessionStorage.setItem(wakeKey(userId), "1");
    else sessionStorage.removeItem(wakeKey(userId));
  } catch {
    /* storage unavailable: the opt-in simply lasts until reload */
  }
}

async function micPermission(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  try {
    const p = await navigator.permissions?.query({ name: "microphone" as PermissionName });
    return p ? (p.state as "granted" | "denied" | "prompt") : "unknown";
  } catch {
    return "unknown"; // Safari/Firefox may not support querying the microphone
  }
}

const MAX_RESTARTS = 6;
const RESTART_WINDOW_MS = 30_000;

export function useWakeWord({
  userId,
  locale,
  busy,
  onWake,
}: {
  userId: string;
  locale: string;
  /** True while G is in its own voice turn or answering: the wake listener steps aside. */
  busy: boolean;
  onWake: (question: string | null) => void;
}) {
  const supported = useSyncExternalStore(noop, supportedSnapshot, () => "0") === "1";
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<WakeStatus>("off");
  const [visible, setVisible] = useState(true);
  const recRef = useRef<Recognition | null>(null);
  const session = useRef(0);
  const lastWakeAt = useRef<number | null>(null);
  const lastResultKey = useRef<string | null>(null);
  const restarts = useRef<number[]>([]);
  const onWakeRef = useRef(onWake);
  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);

  const stopRecognizer = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.abort();
    }
  }, []);

  const disable = useCallback(
    (next: WakeStatus = "off") => {
      stopRecognizer();
      writeOptIn(userId, false);
      setEnabled(false);
      setStatus(next);
    },
    [stopRecognizer, userId],
  );

  // Resume an opt-in made earlier in this tab, but only with permission still granted.
  useEffect(() => {
    if (!supported || !readOptIn(userId)) return;
    let live = true;
    void micPermission().then((p) => {
      if (!live) return;
      if (p === "granted") {
        setEnabled(true);
        setStatus("paused");
      } else {
        setStatus("needs_resume");
      }
    });
    return () => {
      live = false;
    };
  }, [supported, userId]);

  /** Explicit user action: ask for the microphone, then start. */
  const enable = useCallback(async () => {
    if (!supported) {
      setStatus("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
    } catch (e) {
      disable(classifyMicError((e as { name?: string })?.name) === "denied" ? "denied" : "unavailable");
      return;
    }
    restarts.current = [];
    writeOptIn(userId, true);
    setEnabled(true);
    setStatus("paused");
  }, [disable, supported, userId]);

  // Page visibility: never listen in a hidden tab.
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Sign-out stops listening immediately.
  useEffect(() => {
    const onEvent = (e: Event) => {
      if ((e as CustomEvent<GEventDetail>).detail?.type === "signout") disable();
    };
    window.addEventListener(G_EVENT, onEvent);
    return () => window.removeEventListener(G_EVENT, onEvent);
  }, [disable]);

  const shouldRun = enabled && visible && !busy && supported;

  useEffect(() => {
    if (!shouldRun) {
      stopRecognizer();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    let cancelled = false;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;

    const start = () => {
      if (cancelled) return;
      const id = ++session.current;
      const rec = new Ctor();
      rec.lang = SPEECH_LANG[locale] ?? "en-US";
      rec.continuous = true;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          if (!result.isFinal) continue;
          // Matched in memory and dropped; never stored or sent.
          const match = matchWake(result[0]?.transcript ?? "");
          if (!match) continue;
          const key = `${id}:${i}`;
          const now = Date.now();
          if (!mayActivate({ now, lastWakeAt: lastWakeAt.current, resultKey: key, lastResultKey: lastResultKey.current })) continue;
          lastWakeAt.current = now;
          lastResultKey.current = key;
          stopRecognizer(); // free the microphone for G's own question turn
          onWakeRef.current(isQuestion(match.remainder) ? match.remainder : null);
          // G's own turn normally takes over (busy → this effect restarts
          // afterwards). If it never starts, resume after the cooldown.
          restartTimer = setTimeout(start, WAKE_COOLDOWN_MS);
          return;
        }
      };
      rec.onerror = (e) => {
        const kind = classifyWakeError(e.error);
        if (kind === "denied") disable("denied");
        else if (kind === "unavailable") disable("unavailable");
        else if (kind === "network") {
          stopRecognizer();
          setStatus("network");
          cancelled = true;
        }
        // transient: onend follows and restarts
      };
      rec.onend = () => {
        if (cancelled || recRef.current !== rec) return;
        recRef.current = null;
        const now = Date.now();
        restarts.current = [...restarts.current.filter((t) => now - t < RESTART_WINDOW_MS), now];
        if (restarts.current.length > MAX_RESTARTS) {
          setStatus("network");
          return;
        }
        restartTimer = setTimeout(start, 400);
      };
      recRef.current = rec;
      try {
        rec.start();
        setStatus("listening");
      } catch {
        setStatus("network");
      }
    };
    start();
    return () => {
      cancelled = true;
      if (restartTimer) clearTimeout(restartTimer);
      stopRecognizer();
    };
  }, [shouldRun, locale, stopRecognizer, disable]);

  // Never leave the microphone open when G unmounts (sign-out, leaving the app).
  useEffect(() => () => stopRecognizer(), [stopRecognizer]);

  const shownStatus: WakeStatus = !supported ? "unsupported" : enabled && !shouldRun && status === "listening" ? "paused" : status;
  return {
    supported,
    enabled,
    status: shownStatus,
    enable,
    disable: () => disable("off"),
    /** Retry after a network failure. */
    retry: () => {
      restarts.current = [];
      setStatus("paused");
      setEnabled(false);
      setTimeout(() => setEnabled(true), 0);
    },
  };
}

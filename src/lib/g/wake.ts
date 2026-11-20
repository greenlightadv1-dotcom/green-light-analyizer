/**
 * "Hey G" wake phrases (opt-in voice activation). Pure — unit-tested in
 * wake.test.ts.
 *
 * Supported phrases: "Hey G", "Hello G", "أهلًا G", "أهلاً يا G", "يا G".
 *
 * A phrase only counts at the START of an utterance, as whole words, so
 * ordinary talk ("hey guys", "يا جماعة", "I said hey G to him") never opens G.
 * Speech services spell the letter G in different ways ("gee", "جي"), and an
 * Arabic recognizer may write "Hey" as "هاي", so each phrase accepts those
 * spellings. Which language is recognised depends on the recognizer's language
 * (the site language): English phrases are reliable in English, Arabic ones in
 * Arabic. Nothing here stores or sends what was heard; the caller gets only
 * the words that followed the phrase, if any, to use as the question.
 */

export type WakePhraseId = "hey_g" | "hello_g" | "ahlan_g" | "ahlan_ya_g" | "ya_g";

/** The phrases as shown to people (also used in the setting's explanation). */
export const WAKE_PHRASES: Record<WakePhraseId, string> = {
  hey_g: "Hey G",
  hello_g: "Hello G",
  ahlan_g: "أهلًا G",
  ahlan_ya_g: "أهلاً يا G",
  ya_g: "يا G",
};

const G = new Set(["g", "gee", "ji", "jee", "جي", "جى", "چي"]);
const HEY = new Set(["hey", "hay", "hei", "هاي", "هيه"]);
const HELLO = new Set(["hello", "helo", "hallo", "هلو", "هالو", "هيلو"]);
const AHLAN = new Set(["اهلا", "اهلن"]);
const YA = new Set(["يا"]);

/** Longest first, so "أهلاً يا G" is not read as "أهلاً" + something else. */
const PATTERNS: [WakePhraseId, Set<string>[]][] = [
  ["ahlan_ya_g", [AHLAN, YA, G]],
  ["ahlan_g", [AHLAN, G]],
  ["hey_g", [HEY, G]],
  ["hello_g", [HELLO, G]],
  ["ya_g", [YA, G]],
];

/** One spoken word, normalised: case, Arabic diacritics and letter forms, punctuation. */
export function normaliseWord(word: string): string {
  return word
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "") // harakat, tanween, dagger alef, tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]/gu, ""); // punctuation, incl. ، ؟ ؛
}

export type WakeMatch = { phrase: WakePhraseId; remainder: string };

/**
 * Does this utterance start with a wake phrase? Returns the phrase and the
 * rest of the utterance (the user's question, if they said it in one breath),
 * or null.
 */
export function matchWake(transcript: string): WakeMatch | null {
  const raw = transcript.trim().split(/\s+/).filter(Boolean);
  // Keep the raw index of every word that survives normalisation, so the
  // remainder is the person's own wording, not the normalised form.
  const words: { norm: string; at: number }[] = [];
  raw.forEach((w, at) => {
    const norm = normaliseWord(w);
    if (norm) words.push({ norm, at });
  });
  for (const [phrase, pattern] of PATTERNS) {
    if (words.length < pattern.length) continue;
    if (!pattern.every((set, i) => set.has(words[i].norm))) continue;
    const next = words[pattern.length];
    const remainder = next ? raw.slice(next.at).join(" ").replace(/^[\s,.!?،؟؛:-]+/, "").trim() : "";
    return { phrase, remainder };
  }
  return null;
}

/** After G wakes, the same phrase is ignored for this long. */
export const WAKE_COOLDOWN_MS = 4_000;

/**
 * Whether a recognised wake phrase may activate G: never twice for the same
 * recognition result, and not again within the cooldown.
 */
export function mayActivate(input: {
  now: number;
  lastWakeAt: number | null;
  resultKey: string;
  lastResultKey: string | null;
}): boolean {
  if (input.lastResultKey !== null && input.resultKey === input.lastResultKey) return false;
  if (input.lastWakeAt !== null && input.now - input.lastWakeAt < WAKE_COOLDOWN_MS) return false;
  return true;
}

/** A remainder shorter than this is noise ("uh"), not a question. */
export function isQuestion(remainder: string): boolean {
  return normaliseWord(remainder.replace(/\s+/g, "")).length >= 3;
}

/** How a wake-recognition error should be handled. */
export type WakeFailure = "denied" | "unavailable" | "network" | "transient";
export function classifyWakeError(code: string): WakeFailure {
  if (code === "not-allowed" || code === "service-not-allowed") return "denied";
  if (code === "audio-capture") return "unavailable";
  if (code === "network") return "network";
  return "transient"; // no-speech, aborted: just keep listening
}

/** How a getUserMedia rejection should be explained. */
export function classifyMicError(name: string | undefined): "denied" | "unavailable" {
  return name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError" ? "denied" : "unavailable";
}

/**
 * The opt-in lives in sessionStorage (this tab, this user), so it never
 * carries into a new browser session or another account. Within the session
 * it is resumed only while the browser still reports microphone permission as
 * granted; otherwise the user must press Resume.
 */
export const wakeKey = (userId: string) => `gl:g:wake:v1:${userId}`;

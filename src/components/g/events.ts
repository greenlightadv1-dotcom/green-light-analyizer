"use client";

/**
 * How the rest of the app hands something to G without coupling to it: a
 * window event the G panel listens for. Opening G never sends anything by
 * itself; `ask` pre-fills the question for the user to send.
 */
export type GEventDetail =
  | { type: "open" }
  | { type: "ask"; text: string }
  | { type: "compare"; creatorId: string; name: string }
  /** Signing out: stop any listening now and forget G's session data. */
  | { type: "signout" };

export const G_EVENT = "green-light:g";

export function emitG(detail: GEventDetail) {
  window.dispatchEvent(new CustomEvent<GEventDetail>(G_EVENT, { detail }));
}

/**
 * Called by Sign out. Stops "Hey G" and clears G's per-tab data (conversation
 * and voice-activation opt-in) before the session ends, so neither survives
 * into the next sign-in in this tab.
 */
export function signOutG() {
  emitG({ type: "signout" });
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith("gl:g:")) sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

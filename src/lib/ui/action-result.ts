/**
 * What a confirmable server action returns. Errors are dictionary keys, not
 * English sentences, because server actions cannot know the visitor's
 * language (it lives in the browser); the client translates the key. A
 * caller shows success only on `ok: true`, which an action returns only
 * after its write has actually succeeded.
 */
export type ActionResult = { ok: true } | { ok: false; errorKey: string };

export const OK: ActionResult = { ok: true };

export function fail(errorKey: string): ActionResult {
  return { ok: false, errorKey };
}

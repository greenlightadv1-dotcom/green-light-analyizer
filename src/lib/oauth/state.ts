import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const MAX_AGE_MS = 10 * 60 * 1000;

function secret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — cannot sign OAuth state.");
  }
  return key;
}

/**
 * Signs a short-lived CSRF state for the OAuth start -> callback round trip.
 *
 * Stateless (HMAC, not a DB row): a serverless route handler has nothing to
 * persist in memory between the two separate requests, and the provider's
 * redirect back is the only place that state can travel. Keyed by
 * SUPABASE_SERVICE_ROLE_KEY -- already a server-only secret nothing outside
 * this codebase ever sees, so this adds no new secret to manage.
 */
export function signOAuthState(creatorId: string): string {
  const payload = JSON.stringify({
    creatorId,
    nonce: randomBytes(9).toString("base64url"),
    ts: Date.now(),
  });
  const encoded = Buffer.from(payload).toString("base64url");
  const signature = createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

/**
 * True when `state` is validly signed, recent (10 minutes), and was issued
 * for `expectedCreatorId` — the caller who is completing the callback must
 * be the same one who started it, not just anyone with a captured URL.
 */
export function verifyOAuthState(state: string, expectedCreatorId: string): boolean {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return false;

  const expectedSignature = createHmac("sha256", secret()).update(encoded).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  try {
    const payload: { creatorId?: string; ts?: number } = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    if (payload.creatorId !== expectedCreatorId) return false;
    if (typeof payload.ts !== "number" || Date.now() - payload.ts > MAX_AGE_MS) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

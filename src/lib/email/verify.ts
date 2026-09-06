import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhook signature verification for the inbound-email endpoint (§5.3).
 *
 * This is the only unauthenticated, publicly reachable write path in the
 * product. Without a verified signature, anyone who learns the URL can mint
 * deal rooms in any creator's inbox, put words in a sponsor's mouth, and bill
 * us for a Gemini call on every request. The endpoint is worth exactly as much
 * as this function.
 *
 * Resend signs webhooks with the Svix scheme:
 *
 *   signed payload = `${svix-id}.${svix-timestamp}.${raw body}`
 *   signature      = base64(HMAC-SHA256(secret, signed payload))
 *   header         = "v1,<sig> v1,<sig>"   (space-separated, may be several
 *                                           during a secret rotation)
 *
 * Implemented directly rather than pulling in the `svix` package: it is thirty
 * lines, and a dependency in the request path of a public endpoint is its own
 * risk.
 */

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Deliveries older than this are refused, so a captured POST cannot be replayed. */
const TOLERANCE_SECONDS = 5 * 60;

function decodeSecret(secret: string): Buffer {
  // Svix secrets are "whsec_<base64>"; the prefix is not part of the key.
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  return Buffer.from(raw, "base64");
}

/** Length-safe constant-time compare — timingSafeEqual throws on a mismatch. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function expectedSignature(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
): string {
  return createHmac("sha256", decodeSecret(secret))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
}

export function verifyWebhookSignature({
  secret,
  id,
  timestamp,
  signatureHeader,
  body,
  now = Date.now(),
}: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signatureHeader: string | null;
  /** The RAW request body. Verifying a re-serialized object proves nothing. */
  body: string;
  now?: number;
}): VerifyResult {
  if (!secret) return { ok: false, reason: "no signing secret configured" };
  if (!id || !timestamp || !signatureHeader) {
    return { ok: false, reason: "missing signature headers" };
  }

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) {
    return { ok: false, reason: "malformed timestamp" };
  }

  const driftSeconds = Math.abs(now / 1000 - sent);
  if (driftSeconds > TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp outside tolerance" };
  }

  const expected = expectedSignature(secret, id, timestamp, body);

  // The header may carry several signatures while a secret is being rotated;
  // any one matching is a pass. Every candidate is compared so the work does
  // not depend on which position matched.
  let matched = false;
  for (const entry of signatureHeader.split(" ")) {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) continue;
    if (safeEqual(value, expected)) matched = true;
  }

  return matched ? { ok: true } : { ok: false, reason: "signature mismatch" };
}

/**
 * Inbound alias generation — CLAUDE.md §5.1
 *
 *   {handle}.{random}@analyze.greenlight.com
 *
 * Issued to every creator at account creation. The creator then sets up a
 * one-time Gmail auto-forwarding rule from their real public address to this
 * alias; Resend receives mail here and webhooks the backend (§5.3). No Google
 * OAuth and no Gmail API are involved anywhere in that path — by design.
 */

export const INBOUND_DOMAIN =
  process.env.NEXT_PUBLIC_INBOUND_DOMAIN ?? "analyze.greenlight.com";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no look-alike glyphs

function randomSuffix(length = 6) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Normalises a display name or handle into the local-part's first segment. */
export function toHandle(input: string) {
  const handle = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
  return handle || "creator";
}

export function generateInboundAlias(nameOrHandle: string) {
  return `${toHandle(nameOrHandle)}.${randomSuffix()}@${INBOUND_DOMAIN}`;
}

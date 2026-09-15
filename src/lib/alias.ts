/**
 * Inbound alias generation — CLAUDE.md §5.1
 *
 *   {handle}.{random}@analyze.greenlightadvs.com
 *
 * Issued to every creator at account creation. The creator then sets up a
 * one-time Gmail auto-forwarding rule from their real public address to this
 * alias; Resend receives mail here and webhooks the backend (§5.3). No Google
 * OAuth and no Gmail API are involved anywhere in that path — by design.
 */

export const INBOUND_DOMAIN =
  process.env.NEXT_PUBLIC_INBOUND_DOMAIN ?? "analyze.greenlightadvs.com";

/**
 * Domains a delivery may arrive on and still be recognised as ours.
 *
 * An alias is baked into the creator's Gmail forwarding rule, so a domain
 * change does not reach the sender: their filter keeps forwarding to the old
 * address long after the profile row says something else. Accepting the
 * previous domain is what stops that showing up as offers quietly vanishing.
 *
 * Retire an entry once no profile still carries `previous_inbound_alias` on
 * it — `select count(*) from profiles where previous_inbound_alias like
 * '%@analyze.greenlight.com'` answers that.
 */
const LEGACY_INBOUND_DOMAINS = ["analyze.greenlight.com"] as const;

export const ACCEPTED_INBOUND_DOMAINS: readonly string[] = [
  INBOUND_DOMAIN,
  ...LEGACY_INBOUND_DOMAINS.filter((d) => d !== INBOUND_DOMAIN),
];

// No look-alike glyphs, and exactly 32 characters: 256 divides by 32, so
// `byte % 32` is uniform rather than biased toward the front of the alphabet.
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/**
 * Four characters, not six.
 *
 * A bare `{handle}@` reads best, but it makes every creator's intake address
 * derivable from a name that is semi-public on their /p/<slug> page — and each
 * delivery to one opens a deal room and spends a paid evaluation, so a
 * guessable alias is a billable one. Four characters is 32^4 ≈ 1.05 million
 * per handle: still short enough to read aloud, far too many to enumerate, and
 * it removes the collision case between two creators of the same name.
 */
function randomSuffix(length = 4) {
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

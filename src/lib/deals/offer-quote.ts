import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A tamper-evident record of what the Co-Pilot said about a Discover offer.
 *
 * Discover is two steps: the company previews an offer (one AI evaluation),
 * then sends it. The send step has to store the preview's risk rating and
 * recommended price on the deal — and those are exactly the two values the
 * company must not be able to choose, because the creator reads them as the
 * platform's verdict on the company's own offer (`ai_evaluation` is withheld
 * from `authenticated` by column grant for this reason). Carrying them through
 * the browser as plain hidden fields let a company submit "green" and any
 * price it liked.
 *
 * So the preview signs everything the rating depends on, and the send step
 * stores the values only if the signature checks out for this company, this
 * creator and this exact offer. Re-running the evaluation at send time would
 * also work, but it would double the AI cost and make the company wait up to
 * the full AI budget a second time, with a rating that might differ from the
 * one it was just shown.
 */

export type OfferQuote = {
  companyId: string;
  creatorId: string;
  offerText: string;
  sponsorshipType: string;
  targetCountries: string[];
  risk: string;
  recommendedPriceUsd: number;
  offeredAmount: number | null;
};

/** Long enough to read the preview and decide; short enough not to linger. */
export const QUOTE_TTL_MS = 30 * 60 * 1000;

export type QuoteCheck = "ok" | "invalid" | "expired";

function canonical(quote: OfferQuote, issuedAt: number): string {
  return JSON.stringify([
    "offer-quote-v1",
    issuedAt,
    quote.companyId,
    quote.creatorId,
    // Form submission normalises line breaks to CRLF, so the text that comes
    // back from the hidden field is not byte-identical to what was previewed.
    quote.offerText.replace(/\r\n?/g, "\n"),
    quote.sponsorshipType,
    quote.targetCountries,
    quote.risk,
    quote.recommendedPriceUsd,
    quote.offeredAmount,
  ]);
}

function mac(secret: Buffer, quote: OfferQuote, issuedAt: number): Buffer {
  return createHmac("sha256", secret).update(canonical(quote, issuedAt)).digest();
}

export function signQuote(secret: Buffer, quote: OfferQuote, now = Date.now()): string {
  return `${now}.${mac(secret, quote, now).toString("base64url")}`;
}

export function verifyQuote(
  secret: Buffer,
  token: string,
  quote: OfferQuote,
  now = Date.now(),
): QuoteCheck {
  const [stamp, signature, extra] = token.split(".");
  if (!stamp || !signature || extra !== undefined || !/^\d+$/.test(stamp)) return "invalid";

  const issuedAt = Number(stamp);
  const expected = mac(secret, quote, issuedAt);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "invalid";

  // Checked after the signature, so "expired" is only ever said of a quote
  // this server really issued.
  if (issuedAt > now + 60_000) return "invalid";
  if (now - issuedAt > QUOTE_TTL_MS) return "expired";
  return "ok";
}

/**
 * The signing key, derived from a secret the server already holds rather than
 * a new one somebody would have to configure. HMAC with a fixed label keeps the
 * derived key unrelated to the service-role key's own use, and it never leaves
 * the server.
 */
export function quoteSecret(serviceRoleKey: string | undefined): Buffer | null {
  if (!serviceRoleKey) return null;
  return createHmac("sha256", serviceRoleKey).update("green-light/offer-quote/v1").digest();
}

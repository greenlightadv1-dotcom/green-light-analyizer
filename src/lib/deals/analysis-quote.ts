import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A tamper-evident record of what the Co-Pilot said about a Manual Analyzer
 * offer (Stage 0, D3).
 *
 * The analyzer is two steps, like Discover: analyse (one evaluation), then
 * open a deal room. The second step stores the analysis's risk rating and
 * recommended price — the platform's verdict, which `authenticated` is denied
 * by column grant — so it must not accept them from the browser as plain
 * hidden fields. The analyse step signs everything the verdict depends on,
 * and the create step stores the values only under a valid signature issued
 * to this creator for this exact offer, less than QUOTE_TTL_MS old.
 *
 * Same construction as offer-quote.ts, but its own label and its own derived
 * key, so a token issued for one flow can never verify in the other.
 *
 * Pure apart from node:crypto, so it is unit-tested directly.
 */

export type AnalysisQuote = {
  creatorId: string;
  senderEmail: string;
  offerText: string;
  sponsorshipType: string;
  targetCountries: string[];
  risk: string;
  recommendedPriceUsd: number;
};

export const QUOTE_TTL_MS = 30 * 60 * 1000;

export type QuoteCheck = "ok" | "invalid" | "expired";

function canonical(quote: AnalysisQuote, issuedAt: number): string {
  return JSON.stringify([
    "analysis-quote-v1",
    issuedAt,
    quote.creatorId,
    quote.senderEmail,
    // Form submission normalises line breaks to CRLF.
    quote.offerText.replace(/\r\n?/g, "\n"),
    quote.sponsorshipType,
    quote.targetCountries,
    quote.risk,
    quote.recommendedPriceUsd,
  ]);
}

function mac(secret: Buffer, quote: AnalysisQuote, issuedAt: number): Buffer {
  return createHmac("sha256", secret).update(canonical(quote, issuedAt)).digest();
}

export function signAnalysisQuote(secret: Buffer, quote: AnalysisQuote, now = Date.now()): string {
  return `${now}.${mac(secret, quote, now).toString("base64url")}`;
}

export function verifyAnalysisQuote(
  secret: Buffer,
  token: string,
  quote: AnalysisQuote,
  now = Date.now(),
): QuoteCheck {
  const [stamp, signature, extra] = token.split(".");
  if (!stamp || !signature || extra !== undefined || !/^\d+$/.test(stamp)) return "invalid";

  const issuedAt = Number(stamp);
  const expected = mac(secret, quote, issuedAt);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "invalid";

  if (issuedAt > now + 60_000) return "invalid";
  if (now - issuedAt > QUOTE_TTL_MS) return "expired";
  return "ok";
}

export function analysisQuoteSecret(serviceRoleKey: string | undefined): Buffer | null {
  if (!serviceRoleKey) return null;
  return createHmac("sha256", serviceRoleKey).update("green-light/analysis-quote/v1").digest();
}

// --- server-side validation of the create-deal submission --------------------

export const SPONSORSHIP_TYPES = [
  "video_dedicated",
  "integration",
  "story_share",
  "live_mention",
  "post",
  "other",
] as const;

const RISKS = ["green", "yellow", "red"] as const;

/** Above this a "recommended price" is a forged or broken value, not a quote. */
export const MAX_RECOMMENDED_PRICE_USD = 1_000_000;
export const MAX_OFFER_TEXT = 20_000;

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

/** "EG, SA, AE" -> ["EG","SA","AE"]; the same parsing the analyse step uses. */
export function parseCountries(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);
}

export type CreateDealSubmission =
  | {
      ok: true;
      quote: AnalysisQuote;
    }
  | { ok: false; error: string };

/**
 * Reads and validates the create-deal form. Shape checks only — whether the
 * values are the ones the server actually issued is verifyAnalysisQuote's job,
 * and both must pass before anything is written.
 */
export function readCreateDealSubmission(
  creatorId: string,
  get: (name: string) => unknown,
): CreateDealSubmission {
  const text = (name: string) => {
    const v = get(name);
    return typeof v === "string" ? v.trim() : "";
  };

  const senderEmail = text("sender_email");
  const offerText = text("offer_text");
  const sponsorshipType = text("sponsorship_type");
  const risk = text("risk");
  const priceRaw = text("recommended_price_usd");
  const price = /^\d+(\.\d+)?$/.test(priceRaw) ? Number(priceRaw) : Number.NaN;

  const incomplete = { ok: false as const, error: "This analysis is incomplete. Analyse the offer again." };
  if (!senderEmail || !offerText) return incomplete;
  if (!EMAIL.test(senderEmail) || senderEmail.length > 320) return incomplete;
  if (offerText.length > MAX_OFFER_TEXT) return incomplete;
  if (!(SPONSORSHIP_TYPES as readonly string[]).includes(sponsorshipType)) return incomplete;
  if (!(RISKS as readonly string[]).includes(risk)) return incomplete;
  if (!Number.isFinite(price) || price <= 0 || price > MAX_RECOMMENDED_PRICE_USD) return incomplete;

  return {
    ok: true,
    quote: {
      creatorId,
      senderEmail,
      offerText,
      sponsorshipType,
      targetCountries: parseCountries(text("target_countries")),
      risk,
      recommendedPriceUsd: price,
    },
  };
}

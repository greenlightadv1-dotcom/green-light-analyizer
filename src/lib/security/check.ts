import "server-only";

import { checkSafeBrowsing } from "./safebrowsing";
import { lookupWhois } from "./whois";
import { computeTrustScore } from "./trust-score";
import type { SecurityCheckResult } from "./types";

const URL_REGEX = /https?:\/\/[^\s<>"')]+/gi;
const MAX_URLS_CHECKED = 5;

function extractDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

/**
 * Domain/security check for the Manual Analyzer, run alongside
 * evaluateOffer() (see analyzer/actions.ts) — independent on purpose, so a
 * slow or down third-party API never delays or blocks the price/risk
 * recommendation the creator is actually waiting on.
 *
 * The domain checked is the sender's email domain — the signal that matters
 * for "who is behind this offer" — plus up to 5 URLs found in the offer text
 * itself, all submitted to Safe Browsing in one batched call. WHOIS looks up
 * only the sender domain: it is a per-lookup cost, and checking every link's
 * domain too would multiply that for no real benefit here.
 */
export async function runSecurityCheck(
  senderEmail: string,
  offerText: string,
): Promise<SecurityCheckResult | null> {
  const domain = extractDomain(senderEmail);
  if (!domain) return null;

  const extractedUrls = [...offerText.matchAll(URL_REGEX)]
    .map((m) => m[0])
    .slice(0, MAX_URLS_CHECKED);
  const urlsToCheck = [`https://${domain}/`, ...extractedUrls];

  // Neither call rejects — each catches its own failures and resolves to
  // null — so Promise.all (not allSettled) is enough here.
  const [safeBrowsing, whois] = await Promise.all([
    checkSafeBrowsing(urlsToCheck),
    lookupWhois(domain),
  ]);

  const { score, reasons } = computeTrustScore(safeBrowsing, whois);

  return { domain, safeBrowsing, whois, trustScore: score, reasons };
}

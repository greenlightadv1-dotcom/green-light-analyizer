import type { SafeBrowsingResult, WhoisResult } from "./types";

/**
 * Pure trust-score rubric for the domain behind a sponsorship offer.
 *
 *   Safe Browsing flagged any checked URL          -70
 *   Domain age < 6 months                          -25
 *   Domain age 6-12 months                          -10
 *   Expires within 30 days                          -20
 *   Expires within 90 days                          -10
 *   Registrant org AND name both hidden/redacted     -10
 *
 * Floored at 0, capped at 100.
 *
 * Honesty rule (mirrors this app's core anti-fraud principle — never present
 * data as checked when it wasn't): if neither check succeeded, this returns
 * score: null. A caller must render that as "unavailable", never as a
 * numeric default like 0 or 100 — either would misrepresent what was
 * actually verified.
 */
export function computeTrustScore(
  safeBrowsing: SafeBrowsingResult | null,
  whois: WhoisResult | null,
): { score: number | null; reasons: string[] } {
  if (!safeBrowsing && !whois) return { score: null, reasons: [] };

  const DAY_MS = 24 * 60 * 60 * 1000;
  const reasons: string[] = [];
  let score = 100;

  if (safeBrowsing?.flagged) {
    score -= 70;
    reasons.push(
      `Flagged by Google Safe Browsing: ${safeBrowsing.threatTypes.join(", ")}`,
    );
  }

  if (whois?.createdAt) {
    const ageDays = (Date.now() - new Date(whois.createdAt).getTime()) / DAY_MS;
    if (ageDays < 182) {
      score -= 25;
      reasons.push("Domain was registered less than 6 months ago");
    } else if (ageDays < 365) {
      score -= 10;
      reasons.push("Domain was registered less than 12 months ago");
    }
  }

  if (whois?.expiresAt) {
    const daysLeft = (new Date(whois.expiresAt).getTime() - Date.now()) / DAY_MS;
    if (daysLeft < 30) {
      score -= 20;
      reasons.push("Domain registration expires within 30 days");
    } else if (daysLeft < 90) {
      score -= 10;
      reasons.push("Domain registration expires within 90 days");
    }
  }

  // Only deducted when BOTH org and personal name look hidden: a visible
  // company/organization name is the meaningful positive signal for a B2B
  // sponsorship offer, and personal-name privacy alone is extremely common
  // (GDPR-driven) and not worth penalizing on its own.
  if (
    whois &&
    isRedacted(whois.registrantOrganization) &&
    isRedacted(whois.registrantName)
  ) {
    score -= 10;
    reasons.push("Registrant identity is hidden or privacy-protected");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

const PRIVACY_PATTERNS = [
  "privacy",
  "redacted",
  "proxy",
  "whoisguard",
  "domains by proxy",
  "protect",
];

function isRedacted(value: string | null): boolean {
  if (!value || !value.trim()) return true;
  const lower = value.toLowerCase();
  return PRIVACY_PATTERNS.some((p) => lower.includes(p));
}

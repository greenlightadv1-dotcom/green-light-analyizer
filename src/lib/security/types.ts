/**
 * Domain/security check for the Manual Analyzer.
 *
 * Not part of the original CLAUDE.md §5 spec — an extension added on top of
 * it. Every result field that comes from a third-party API is nullable, and
 * null always means "could not check", never "checked and clean". A missing
 * key or a failed call must never be indistinguishable from a real all-clear.
 */

export type SafeBrowsingResult = {
  flagged: boolean;
  /** e.g. "MALWARE", "SOCIAL_ENGINEERING". Empty when not flagged. */
  threatTypes: string[];
};

export type WhoisResult = {
  domain: string;
  createdAt: string | null;
  expiresAt: string | null;
  registrantOrganization: string | null;
  registrantName: string | null;
  registrantCountry: string | null;
  /** Whatever source/whois-server field IP2Whois returns, shown as-is. */
  whoisServer: string | null;
};

export type SecurityCheckResult = {
  domain: string;
  /** null = Safe Browsing could not be checked (no key, network error, non-2xx). */
  safeBrowsing: SafeBrowsingResult | null;
  /** null = the WHOIS lookup failed or no key is configured. */
  whois: WhoisResult | null;
  /** null = both checks failed, so there is nothing honest to score. */
  trustScore: number | null;
  /** Every deduction actually applied, in plain language. */
  reasons: string[];
};

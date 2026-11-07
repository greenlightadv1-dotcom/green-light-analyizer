import type { CompanyProfile, CompanyTrustBand } from "@/lib/ai/company-intel-types";
import type { SafeBrowsingResult, SecurityCheckResult, WhoisResult } from "@/lib/security/types";

/**
 * `deal_chats.security_check` and `deal_chats.company_profile` are jsonb
 * columns, so nothing in the database guarantees their shape. Every write path
 * produces the full shape today, but a row written by an older build, edited
 * by hand, or truncated would otherwise crash the whole deal room. A room's
 * chat must always render, so the side panel reads these through here.
 *
 * Valid records come back with the same values. A malformed field is dropped
 * or emptied (never invented); a value that is not an object at all, or has no
 * usable domain, is treated as absent.
 */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const BANDS: readonly CompanyTrustBand[] = ["low", "medium", "high"];
const band = (v: unknown): CompanyTrustBand | null => (BANDS.includes(v as CompanyTrustBand) ? (v as CompanyTrustBand) : null);

function safeBrowsing(v: unknown): SafeBrowsingResult | null {
  if (!isObj(v) || typeof v.flagged !== "boolean") return null;
  return { flagged: v.flagged, threatTypes: strList(v.threatTypes) };
}

function whois(v: unknown): WhoisResult | null {
  if (!isObj(v)) return null;
  const domain = str(v.domain);
  if (!domain) return null;
  return {
    domain,
    createdAt: str(v.createdAt),
    expiresAt: str(v.expiresAt),
    registrantOrganization: str(v.registrantOrganization),
    registrantName: str(v.registrantName),
    registrantCountry: str(v.registrantCountry),
    whoisServer: str(v.whoisServer),
  };
}

export function normalizeSecurityCheck(v: unknown): SecurityCheckResult | null {
  if (!isObj(v)) return null;
  const domain = str(v.domain);
  if (!domain) return null;
  return {
    domain,
    safeBrowsing: safeBrowsing(v.safeBrowsing),
    whois: whois(v.whois),
    trustScore: num(v.trustScore),
    reasons: strList(v.reasons),
  };
}

/**
 * A company brief is shown only when it is complete enough to be honest: the
 * score, its band and the "known to the model" flag decide how it reads, so a
 * brief missing any of them is treated as absent (the creator can re-run it)
 * rather than half-rendered.
 */
export function normalizeCompanyProfile(v: unknown): CompanyProfile | null {
  if (!isObj(v)) return null;
  const domain = str(v.domain);
  const score = num(v.trustworthinessScore);
  const b = band(v.band);
  const confidence = band(v.confidence);
  const generatedAt = str(v.generatedAt);
  if (!domain || score === null || !b || !confidence || typeof v.isKnownToModel !== "boolean" || !generatedAt || Number.isNaN(Date.parse(generatedAt))) {
    return null;
  }
  return {
    domain,
    isKnownToModel: v.isKnownToModel,
    background: str(v.background) ?? "",
    history: str(v.history) ?? "",
    trustworthinessScore: score,
    band: b,
    signals: strList(v.signals),
    confidence,
    generatedAt,
  };
}

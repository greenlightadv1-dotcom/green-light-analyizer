import "server-only";

import type { WhoisResult } from "./types";

const ENDPOINT = "https://api.ip2whois.com/v2";

/**
 * IP2Whois v2 lookup on a single domain.
 *
 * The response shape here is written from IP2Whois's published API
 * reference, not verified against a live call — outbound access to
 * third-party APIs is blocked from the sandbox this was built in. Parses
 * defensively (every field optional, same approach as nvidia.ts) for exactly
 * that reason. Confirm the real field names against one live lookup before
 * relying on this in production, and adjust here if they differ.
 *
 * Returns null on any failure — no key, network error, non-2xx response, or
 * an API-level error payload — never a half-filled result.
 */
export async function lookupWhois(domain: string): Promise<WhoisResult | null> {
  const key = process.env.IP2WHOIS_API_KEY;
  if (!key) return null;

  try {
    const url = `${ENDPOINT}?key=${encodeURIComponent(key)}&domain=${encodeURIComponent(domain)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;

    const body: {
      error?: unknown;
      create_date?: string;
      expire_date?: string;
      whois_server?: string;
      registrant?: { organization?: string; name?: string; country?: string };
    } = await response.json();

    if (body.error) return null;

    return {
      domain,
      createdAt: body.create_date ?? null,
      expiresAt: body.expire_date ?? null,
      registrantOrganization: body.registrant?.organization ?? null,
      registrantName: body.registrant?.name ?? null,
      registrantCountry: body.registrant?.country ?? null,
      whoisServer: body.whois_server ?? null,
    };
  } catch {
    return null;
  }
}

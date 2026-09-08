import "server-only";

import type { SafeBrowsingResult } from "./types";

const ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find";

/**
 * Google Safe Browsing v4 — checks every URL in one batched call rather than
 * one request per URL, which is both cheaper against quota and simpler.
 *
 * Returns null (not "not flagged") on any failure: no key configured,
 * network error, or a non-2xx response. A caller must never read null as
 * "clean" — see the honesty rule in trust-score.ts.
 */
export async function checkSafeBrowsing(
  urls: string[],
): Promise<SafeBrowsingResult | null> {
  const key = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  if (!key || urls.length === 0) return null;

  try {
    const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client: { clientId: "green-light", clientVersion: "1.0.0" },
        threatInfo: {
          threatTypes: [
            "MALWARE",
            "SOCIAL_ENGINEERING",
            "UNWANTED_SOFTWARE",
            "POTENTIALLY_HARMFUL_APPLICATION",
          ],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: urls.map((url) => ({ url })),
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const body: { matches?: { threatType: string }[] } = await response.json();
    const matches = body.matches ?? [];

    return {
      flagged: matches.length > 0,
      threatTypes: [...new Set(matches.map((m) => m.threatType))],
    };
  } catch {
    return null;
  }
}

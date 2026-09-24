/**
 * How the NVIDIA NIM endpoint is configured.
 *
 * NVIDIA is the only AI provider in this product, by explicit instruction. A
 * brief earlier revision ran calls down a chain with a secondary provider
 * behind it; that was removed, and the path is now exactly:
 * **NVIDIA → static fallback**. There is no second endpoint to fail over to —
 * when NVIDIA is rate-limited, down, misconfigured or absent, the callers fall
 * to what they can compute themselves (evaluate.ts's rule-based pricing,
 * reply-template.ts's written templates) or report the engine as unavailable.
 * Do not reintroduce a second provider without asking, per CLAUDE.md §9.
 *
 * Deliberately free of `server-only` and of any `process.env` read of its own:
 * `resolveNvidia` takes the environment as an argument, so the resolution
 * rules are testable under the plain Node test runner. chat.ts is the only
 * thing that passes it real env.
 */

export type NvidiaProvider = {
  endpoint: string;
  model: string;
  apiKey: string;
  /**
   * What had to be stripped off the raw NVIDIA_API_KEY to make it usable, if
   * anything. Logged on a 401 and nowhere else — see chat.ts. Never the key.
   */
  keyNotes: string[];
  /** Optional request-body extras, e.g. reasoning_effort. */
  extraBody?: Record<string, unknown>;
  /**
   * Per-call budget. It has to fit inside the serverless function's own limit
   * — the inbound webhook waits on this synchronously while turning an offer
   * into a deal room, and a function killed by the platform mid-call returns
   * nothing at all rather than the rule-based estimate.
   */
  timeoutMs: number;
};

export const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

/** Overridable per deployment via NVIDIA_MODEL, without a code change. */
export const NVIDIA_DEFAULT_MODEL = "z-ai/glm-5.3";

/**
 * Under the webhook's maxDuration = 60 with room to spare. Generous because a
 * large reasoning model on a free/trial queue can be slow to first token, and
 * a timeout here is indistinguishable from an outage to everyone downstream.
 */
export const NVIDIA_TIMEOUT_MS = 45_000;

type Env = Record<string, string | undefined>;

/**
 * Characters that survive `String.prototype.trim()` and silently corrupt a
 * credential.
 *
 * `trim()` removes ASCII whitespace and NBSP and stops there. It does **not**
 * remove the zero-width and bidirectional marks that copy-paste inserts:
 * U+200B zero-width space, U+FEFF byte-order mark, and — the one that matters
 * most here — U+200E/U+200F, the left-to-right and right-to-left marks that
 * RTL-aware editors, terminals and chat clients add around a Latin-script
 * string when it is copied out of Arabic context.
 *
 * A single invisible character on either end of an NVIDIA key produces an
 * `Authorization: Bearer <key>` header that is byte-for-byte wrong while
 * looking identical to the correct one everywhere a human inspects it. NVIDIA
 * answers 401 "Authentication failed", which is indistinguishable from a
 * revoked key, and the search goes to the wrong place.
 */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD]/g;

/** A credential or a model id: one token, no spaces anywhere in it, ever. */
function cleanToken(value: string | undefined): { value: string; notes: string[] } {
  const notes: string[] = [];
  let out = value ?? "";

  const withoutInvisible = out.replace(INVISIBLE, "");
  if (withoutInvisible !== out) notes.push("zero-width or bidi marks");
  out = withoutInvisible.trim();

  // One layer of wrapping quotes. A value pasted into a Vercel environment
  // variable as `"nvapi-..."` is stored WITH the quotes.
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1).trim();
    notes.push("wrapping quotes");
  }

  // The header prefix pasted into the value as well, which yields
  // `Authorization: Bearer Bearer nvapi-...`.
  const prefixed = out.match(/^(bearer|token)\s+(.*)$/i);
  if (prefixed) {
    out = prefixed[2].trim();
    notes.push(`a redundant "${prefixed[1]}" prefix`);
  }

  // Inner whitespace, from a paste that wrapped across lines. Never legitimate
  // in a key or a model id, and a raw newline in a header value throws inside
  // fetch rather than reaching NVIDIA at all.
  const withoutInner = out.replace(/\s+/g, "");
  if (withoutInner !== out) notes.push("embedded whitespace");
  out = withoutInner;

  return { value: out, notes };
}

/**
 * A non-secret description of the key's shape, for a 401 log line.
 *
 * Length and a six-character prefix are enough to tell "the value in Vercel is
 * not what I think it is" from "the key is genuinely rejected", and neither
 * identifies the key. Six characters of an `nvapi-` key is the literal word
 * "nvapi-".
 */
export function describeKey(apiKey: string, notes: string[]): string {
  const shape = `${apiKey.length} chars, starts "${apiKey.slice(0, 6)}"`;
  return notes.length ? `${shape}; stripped ${notes.join(", ")}` : shape;
}

/** Header values must be visible ASCII. Anything else throws inside fetch. */
export function isHeaderSafe(apiKey: string): boolean {
  return /^[\x21-\x7E]+$/.test(apiKey);
}

/**
 * The configured provider, or null when there is no usable key.
 *
 * Null is a supported state, not an error: every caller has its own
 * deterministic fallback, and returning null here is how "no AI is configured"
 * stays distinguishable from "AI was tried and refused" at the call site.
 */
export function resolveNvidia(env: Env): NvidiaProvider | null {
  const { value: apiKey, notes: keyNotes } = cleanToken(env.NVIDIA_API_KEY);
  if (!apiKey) return null;

  return {
    endpoint: NVIDIA_ENDPOINT,
    model: cleanToken(env.NVIDIA_MODEL).value || NVIDIA_DEFAULT_MODEL,
    apiKey,
    keyNotes,
    // reasoning_effort is specific to reasoning-capable models on NIM, not a
    // field every model in the catalog accepts, so it is opt-in rather than
    // hardcoded — NVIDIA_MODEL can be pointed at a model that rejects it.
    extraBody: cleanToken(env.NVIDIA_REASONING_EFFORT).value
      ? { reasoning_effort: cleanToken(env.NVIDIA_REASONING_EFFORT).value }
      : undefined,
    timeoutMs: NVIDIA_TIMEOUT_MS,
  };
}

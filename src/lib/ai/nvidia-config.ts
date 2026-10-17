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
  /** Cap on any single attempt. */
  attemptMs: number;
  /** Cap on all attempts together, including the gap between them. */
  deadlineMs: number;
};

export const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

/**
 * Overridable per deployment via NVIDIA_MODEL, without a code change — and
 * NVIDIA_MODEL WINS, so this default only applies where that variable is unset.
 *
 * A text-only instruction-tuned model, deliberately. This workload sends one
 * string and wants a small JSON object back (see chat.ts: nothing here can
 * send an image), so a vision model pays for a capability it is never given
 * and answers more slowly for it — which is what produced the 45s timeouts on
 * meta/llama-3.2-90b-vision-instruct. Same family as that model, so the
 * prompts carry over unchanged.
 *
 * Not verified against the live catalog from the environment this was written
 * in: integrate.api.nvidia.com is unreachable from it. `node
 * scripts/check-nvidia.mjs` lists what a given key can actually reach and
 * says whether this id is among them — a wrong id is not an error, it 404s
 * and the product quietly serves rule-based output.
 */
export const NVIDIA_DEFAULT_MODEL = "meta/llama-3.3-70b-instruct";

/**
 * The time budget, and why it is not simply 60 seconds.
 *
 * Vercel's Hobby ceiling is 60s of *function* time, and the AI call is not the
 * only thing inside it. The inbound webhook still has to create the deal room,
 * write the messages, log a violation and fire the WhatsApp alert after the
 * model answers; the analyzer still has to write its deal and revalidate.
 *
 * So a 60s fetch timeout under a 60s maxDuration is worse than useless: the
 * platform kills the function at the same instant the abort fires, which means
 * no rule-based fallback, no error surfaced to the creator, and no log line
 * explaining any of it. The request simply vanishes. The AI budget has to end
 * far enough before the function's own limit that everything downstream of it
 * still gets to run.
 *
 *   DEADLINE  50s  all attempts plus the gap between them
 *   ATTEMPT   32s  any one attempt
 *   MIN_RETRY 14s  below this there is no point starting another attempt
 *
 * 50 + ~10s of headroom = 60. Two attempts fit (32 + 18), and a single slow
 * one still gets 32s — shorter than the old 45s, deliberately, because the
 * retry is worth more against a queue stall than the extra 13 seconds were.
 */
export const NVIDIA_DEADLINE_MS = 50_000;
export const NVIDIA_ATTEMPT_MS = 32_000;
export const NVIDIA_MIN_RETRY_MS = 14_000;

/** The route-segment maxDuration every AI path must declare. */
export const REQUIRED_MAX_DURATION = 60;

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
  //
  // `[\s\S]*` rather than `.*`: `.` does not match a newline and `$` is not
  // multiline, so a value that wrapped right after the prefix
  // ("Bearer nvapi-abc\ndef") did not match at all — and the whitespace strip
  // below then glued the prefix on as "Bearernvapi-abcdef", a 401 whose notes
  // blamed whitespace and pointed away from the real fault.
  const prefixed = out.match(/^(bearer|token)\s+([\s\S]*)$/i);
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

/** The prefix of a build.nvidia.com key — the only shape safe to echo. */
const NVAPI_PREFIX = "nvapi-";

/**
 * A non-secret description of the key's shape, for a 401 log line.
 *
 * The length is what actually settles the question — "the value in the
 * environment is not what I think it is" versus "the key is genuinely
 * rejected" — and a length identifies nothing.
 *
 * The prefix is echoed ONLY when it is the literal `nvapi-`, where printing it
 * reveals a constant. For anything else the shape is reported without it: the
 * 401 advice in chat.ts and check-nvidia.mjs explicitly tells the operator to
 * suspect an NGC or org key, which is exactly the case where six characters
 * would be six real characters of a live credential — and for a short typo'd
 * value it would be the whole thing.
 */
export function describeKey(apiKey: string, notes: string[]): string {
  const shape = apiKey.startsWith(NVAPI_PREFIX)
    ? `${apiKey.length} chars, starts "${NVAPI_PREFIX}"`
    : `${apiKey.length} chars, does not start "${NVAPI_PREFIX}" (an NGC or org key will not work here)`;
  return notes.length ? `${shape}; stripped ${notes.join(", ")}` : shape;
}

/**
 * A Retry-After is capped at the whole deadline, because a wait longer than
 * that can never leave room for an attempt — the caller's budget check then
 * rejects it and falls back, which is the right outcome. Capping here keeps a
 * server naming an hour from producing a nonsense number downstream.
 */
const MAX_RETRY_AFTER_MS = NVIDIA_DEADLINE_MS;

/**
 * `Retry-After`, in milliseconds, or 0 when absent or unusable.
 *
 * Honoured rather than ignored because re-requesting a 429 immediately is
 * worse than waiting: on NIM it commonly extends the penalty window instead of
 * clearing it. Accepts both forms RFC 9110 allows — delay-seconds and an HTTP
 * date — and caps the result so a server naming an hour cannot make the retry
 * loop sit on the whole budget. The caller still checks the value against the
 * time it actually has left.
 */
export function parseRetryAfterMs(header: string | null): number {
  if (!header?.trim()) return 0;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    if (seconds < 0) return 0;
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }

  const at = Date.parse(header);
  if (!Number.isNaN(at)) {
    return Math.min(Math.max(at - Date.now(), 0), MAX_RETRY_AFTER_MS);
  }

  return 0;
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

  const reasoningEffort = cleanToken(env.NVIDIA_REASONING_EFFORT).value;

  return {
    endpoint: NVIDIA_ENDPOINT,
    model: cleanToken(env.NVIDIA_MODEL).value || NVIDIA_DEFAULT_MODEL,
    apiKey,
    keyNotes,
    // reasoning_effort is specific to reasoning-capable models on NIM, not a
    // field every model in the catalog accepts, so it is opt-in rather than
    // hardcoded — NVIDIA_MODEL can be pointed at a model that rejects it.
    extraBody: reasoningEffort ? { reasoning_effort: reasoningEffort } : undefined,
    attemptMs: NVIDIA_ATTEMPT_MS,
    deadlineMs: NVIDIA_DEADLINE_MS,
  };
}

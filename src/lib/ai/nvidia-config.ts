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

export const NVIDIA_TIMEOUT_MS = 30_000;

type Env = Record<string, string | undefined>;

/**
 * The configured provider, or null when there is no usable key.
 *
 * Null is a supported state, not an error: every caller has its own
 * deterministic fallback, and returning null here is how "no AI is configured"
 * stays distinguishable from "AI was tried and refused" at the call site.
 */
export function resolveNvidia(env: Env): NvidiaProvider | null {
  const apiKey = env.NVIDIA_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    endpoint: NVIDIA_ENDPOINT,
    model: env.NVIDIA_MODEL?.trim() || NVIDIA_DEFAULT_MODEL,
    apiKey,
    // reasoning_effort is specific to reasoning-capable models on NIM, not a
    // field every model in the catalog accepts, so it is opt-in rather than
    // hardcoded — NVIDIA_MODEL can be pointed at a model that rejects it.
    extraBody: env.NVIDIA_REASONING_EFFORT?.trim()
      ? { reasoning_effort: env.NVIDIA_REASONING_EFFORT.trim() }
      : undefined,
    timeoutMs: NVIDIA_TIMEOUT_MS,
  };
}

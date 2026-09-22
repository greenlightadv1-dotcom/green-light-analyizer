/**
 * Which model answers, and in what order.
 *
 * Every AI call in this product now runs against a *chain* of OpenAI-compatible
 * chat-completions endpoints rather than one endpoint: NVIDIA first, Groq
 * second, and only then the deterministic fallbacks that already existed
 * (evaluate.ts's rule-based pricing, reply-template.ts's written templates).
 *
 * Why a chain at all. Every one of these calls sits on a path somebody is
 * waiting on — an inbound webhook converting an offer into a deal room, a
 * creator pressing a button. NVIDIA's free/trial tier is exactly where a rate
 * limit or a queue stall shows up, and until now a 429 there meant the
 * rule-based engine priced a real sponsorship deal. A second provider is far
 * cheaper than that outcome, and Groq is a good second because it is fast
 * enough not to blow the serverless time budget when it is the one answering.
 *
 * Why not the `groq-sdk` package. Groq speaks the same OpenAI-compatible
 * chat-completions shape NVIDIA NIM does, which this codebase already talks to
 * with plain `fetch`. Adding a dependency to send the same POST would make the
 * two providers look different in the source when the whole point is that they
 * are interchangeable — and §9's zero-cost MVP has kept its dependency list
 * short deliberately.
 *
 * Deliberately free of `server-only` and of any `process.env` read of its own:
 * `resolveProviders` takes the environment as an argument, so the ordering
 * rules are testable under the plain Node test runner. The server module
 * (chat.ts) is the only thing that passes it real env.
 */

export type ProviderName = "nvidia" | "groq";

export type Provider = {
  name: ProviderName;
  endpoint: string;
  model: string;
  apiKey: string;
  /** Provider-specific request-body fields. Never sent to the other one. */
  extraBody?: Record<string, unknown>;
  /**
   * Per-attempt budget. These are short, and that is load-bearing: a serverless
   * function that is killed by the platform mid-attempt never reaches the next
   * provider, so a generous first timeout defeats the failover it is guarding.
   * The chain's worst case has to fit inside the function's own limit.
   */
  timeoutMs: number;
};

export const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";
export const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export const NVIDIA_DEFAULT_MODEL = "moonshotai/kimi-k3";
export const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";

type Env = Record<string, string | undefined>;

/**
 * The providers that are actually usable, in the order they should be tried.
 *
 * A provider with no key is not "broken", it is absent — it is left out of the
 * chain entirely rather than included and failed, so a deployment with only
 * GROQ_API_KEY set runs on Groq as its primary without any further
 * configuration. An empty array means no AI is configured at all, which is a
 * supported state: the callers each have their own deterministic fallback.
 */
export function resolveProviders(env: Env): Provider[] {
  const providers: Provider[] = [];

  const nvidiaKey = env.NVIDIA_API_KEY?.trim();
  if (nvidiaKey) {
    providers.push({
      name: "nvidia",
      endpoint: NVIDIA_ENDPOINT,
      model: env.NVIDIA_MODEL?.trim() || NVIDIA_DEFAULT_MODEL,
      apiKey: nvidiaKey,
      // reasoning_effort is specific to reasoning-capable models on NIM and is
      // not a field Groq's Llama models understand, which is why it rides on
      // the provider rather than on the request.
      extraBody: env.NVIDIA_REASONING_EFFORT?.trim()
        ? { reasoning_effort: env.NVIDIA_REASONING_EFFORT.trim() }
        : undefined,
      timeoutMs: 20_000,
    });
  }

  const groqKey = env.GROQ_API_KEY?.trim();
  if (groqKey) {
    providers.push({
      name: "groq",
      endpoint: GROQ_ENDPOINT,
      model: env.GROQ_MODEL?.trim() || GROQ_DEFAULT_MODEL,
      apiKey: groqKey,
      timeoutMs: 12_000,
    });
  }

  return providers;
}

/** Worst-case wall time for a full pass down the chain. */
export function chainBudgetMs(providers: Provider[]): number {
  return providers.reduce((total, p) => total + p.timeoutMs, 0);
}

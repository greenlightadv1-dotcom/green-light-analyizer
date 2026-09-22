import "server-only";

import {
  chainBudgetMs,
  resolveProviders,
  type Provider,
  type ProviderName,
} from "./provider-chain";

/**
 * One chat-completions call, tried against each configured provider in turn.
 *
 * This is the only place in the product that talks to a model. The four
 * callers — pricing (evaluate.ts), reply drafting, company intelligence and
 * niche detection — differ only in their prompt and what they do with the
 * answer, and every one of them previously carried its own copy of the same
 * fetch/timeout/parse boilerplate against a hardcoded NVIDIA endpoint. Folding
 * that into one function is what makes the Groq failover apply to all four at
 * once rather than to whichever ones somebody remembered to update.
 *
 * §12 handling is unchanged and applies to every provider in the chain
 * identically: nothing here logs or persists a prompt, and no error raised by
 * this module carries a response body. That second rule is deliberate — an
 * error response from an OpenAI-compatible endpoint routinely echoes the
 * request back, and the request contains the offer text. Status codes and
 * shape complaints only.
 *
 * Read the provider-specific data-retention terms before pointing this at a
 * new endpoint. The NVIDIA analysis is in the README's Engine section; Groq's
 * own terms are a separate document and a separate decision, and adding a
 * provider here means offer text reaches it.
 */

export class AiUnavailableError extends Error {
  /** One line per provider tried, in order. Empty when none were configured. */
  readonly attempts: { provider: ProviderName; reason: string }[];

  constructor(attempts: { provider: ProviderName; reason: string }[]) {
    super(
      attempts.length
        ? `every AI provider failed: ${attempts.map((a) => `${a.provider} (${a.reason})`).join("; ")}`
        : "no AI provider is configured",
    );
    this.name = "AiUnavailableError";
    this.attempts = attempts;
  }

  /** True when nothing was configured, as opposed to configured and failing. */
  get unconfigured(): boolean {
    return this.attempts.length === 0;
  }
}

export type ChatRequest = {
  prompt: string;
  temperature: number;
  maxTokens: number;
};

export type ChatResult = {
  text: string;
  provider: ProviderName;
  model: string;
};

async function callProvider(
  provider: Provider,
  request: ChatRequest,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), provider.timeoutMs);

  let response: Response;
  try {
    response = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: "user", content: request.prompt }],
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        // An OpenAI-compatible hint, not a guarantee, on either provider —
        // which is why every caller parses through extractJsonObject rather
        // than trusting JSON.parse on the raw content.
        response_format: { type: "json_object" },
        ...provider.extraBody,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // No body, ever — see the §12 note above. The status is what distinguishes
    // the cases that matter anyway: 401 a bad key, 404 a bad model id, 429 a
    // rate limit, 5xx the provider being down.
    throw new Error(`HTTP ${response.status}`);
  }

  const body = await response.json();
  const text: string | undefined = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error("response carried no content");

  return text;
}

/**
 * Try each configured provider in order; return the first one that answers.
 *
 * `validate` is what makes the failover mean something. Without it, a provider
 * that returns 200 with unparseable or wrong-shaped content would end the
 * chain successfully and hand the caller garbage, and the second provider —
 * which might well have answered correctly — would never be tried. Callers
 * pass the same shape check they were already doing after parsing, so a
 * malformed answer now falls through to the next provider instead of to the
 * static fallback.
 *
 * Throws AiUnavailableError when nothing is configured or everything failed.
 * Callers decide what that means: pricing has a rule-based engine, the reply
 * generator has a written template, niche detection has nothing and returns
 * null. None of those are this function's business.
 */
export async function chatJson<T>(
  request: ChatRequest,
  validate: (parsed: unknown) => T,
): Promise<{ value: T } & ChatResult> {
  const providers = resolveProviders(process.env);
  const attempts: { provider: ProviderName; reason: string }[] = [];

  for (const provider of providers) {
    try {
      const text = await callProvider(provider, request);
      return {
        value: validate(extractJsonObject(text)),
        text,
        provider: provider.name,
        model: provider.model,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      attempts.push({ provider: provider.name, reason });
      // Logged per provider rather than only in aggregate: "NVIDIA 429, Groq
      // answered" is the signal that the primary needs attention even though
      // nobody saw a failure, and it is invisible from the outside otherwise.
      console.error(
        `AI provider ${provider.name} (${provider.model}) failed: ${reason}`,
      );
    }
  }

  throw new AiUnavailableError(attempts);
}

/** Whether any provider is configured at all. Cheap; no network. */
export function aiConfigured(): boolean {
  return resolveProviders(process.env).length > 0;
}

/** Worst-case wall time a chatJson call can take before giving up. */
export function aiBudgetMs(): number {
  return chainBudgetMs(resolveProviders(process.env));
}

/**
 * Pulls the first balanced `{...}` object out of a response.
 *
 * `response_format: { type: "json_object" }` is an OpenAI-compatible hint that
 * neither NIM nor Groq guarantees for every backing model, and a model that
 * wraps the answer in a code fence or a sentence should still parse rather
 * than sending the whole chain to its static fallback over a formatting quirk.
 */
export function extractJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // fall through to the more tolerant paths below
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // fall through
    }
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return JSON.parse(text.slice(start, end + 1));
  }

  throw new Error("no JSON object found in the model's response");
}

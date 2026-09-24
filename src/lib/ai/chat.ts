import "server-only";

import { resolveNvidia, type NvidiaProvider } from "./nvidia-config";

/**
 * The one place in this product that talks to a model.
 *
 * Four callers — pricing (evaluate.ts), reply drafting, company intelligence
 * and niche detection — differ only in their prompt and what they do with the
 * answer, and each used to carry its own copy of the same fetch/timeout/parse
 * boilerplate. They share this instead, so a change to how the endpoint is
 * called, timed out or parsed happens once rather than four times.
 *
 * NVIDIA is the only provider. An earlier revision chained a second one behind
 * it; that was removed at the client's request, so the path is exactly
 * **NVIDIA → static fallback** and there is nothing here that reaches any
 * other host. When the call fails, the caller falls to what it can compute
 * itself or reports the engine unavailable — see each caller.
 *
 * §12: nothing here logs or persists a prompt, and no error raised by this
 * module carries a response body. That second rule is deliberate — an error
 * response from an OpenAI-compatible endpoint routinely echoes the request
 * back, and the request contains the offer text. Status codes and shape
 * complaints only.
 */

export class AiUnavailableError extends Error {
  /** True when no key is configured, as opposed to configured and failing. */
  readonly unconfigured: boolean;

  constructor(reason: string, unconfigured = false) {
    super(unconfigured ? "NVIDIA_API_KEY is not configured" : `NVIDIA call failed: ${reason}`);
    this.name = "AiUnavailableError";
    this.unconfigured = unconfigured;
  }
}

export type ChatRequest = {
  prompt: string;
  temperature: number;
  maxTokens: number;
};

export type ChatResult = { model: string };

async function callNvidia(provider: NvidiaProvider, request: ChatRequest): Promise<string> {
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
        // An OpenAI-compatible hint, not a guarantee for every model in the
        // NIM catalog — which is why every caller parses through
        // extractJsonObject rather than trusting JSON.parse on the content.
        response_format: { type: "json_object" },
        ...provider.extraBody,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // No body, ever — see the §12 note above. The status distinguishes the
    // cases that matter anyway: 401 a bad key, 404 a bad model id, 429 a rate
    // limit, 5xx NVIDIA being down.
    throw new Error(`HTTP ${response.status}`);
  }

  const body = await response.json();
  const text: string | undefined = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error("response carried no content");

  return text;
}

/**
 * One JSON chat completion against NVIDIA.
 *
 * `validate` is the caller's shape check, run here rather than after the call
 * returns, so a 200 carrying unparseable or wrong-shaped content is a failure
 * of the call rather than a value handed back to the caller. Since there is no
 * second provider, that means it goes to the static fallback — which is the
 * right outcome: a rule-based price is honest, a hallucinated one is not.
 *
 * Throws AiUnavailableError, whose `unconfigured` flag separates "no key set"
 * from "key set and the call failed". Callers decide what each means: pricing
 * has a rule-based engine, the reply generator has a written template, niche
 * detection has nothing and returns null.
 */
export async function chatJson<T>(
  request: ChatRequest,
  validate: (parsed: unknown) => T,
): Promise<{ value: T } & ChatResult> {
  const provider = resolveNvidia(process.env);
  if (!provider) throw new AiUnavailableError("", true);

  try {
    const text = await callNvidia(provider, request);
    return { value: validate(extractJsonObject(text)), model: provider.model };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    // Logged here rather than only at the call site: a wrong NVIDIA_MODEL
    // (404) and a spent quota (429) are invisible from outside — the product
    // just quietly serves rule-based output — and the status is what tells
    // them apart.
    console.error(`NVIDIA (${provider.model}) failed: ${reason}`);
    throw new AiUnavailableError(reason);
  }
}

/** Whether NVIDIA is configured at all. Cheap; no network. */
export function aiConfigured(): boolean {
  return resolveNvidia(process.env) !== null;
}

/**
 * Pulls the first balanced `{...}` object out of a response.
 *
 * `response_format: { type: "json_object" }` is an OpenAI-compatible hint that
 * NIM does not guarantee for every backing model, and a model that wraps the
 * answer in a code fence or a sentence should still parse rather than sending
 * the caller to its static fallback over a formatting quirk.
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

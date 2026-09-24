import "server-only";

import {
  NVIDIA_MIN_RETRY_MS,
  describeKey,
  isHeaderSafe,
  resolveNvidia,
  type NvidiaProvider,
} from "./nvidia-config";

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
 * Text only, by construction: `messages` is always a single user turn whose
 * content is a string. Nothing here can send an image or a binary attachment,
 * and no caller has a way to pass one — which is worth knowing when choosing
 * NVIDIA_MODEL, since a vision model carries that capability's cost on every
 * call whether or not it is used.
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

/**
 * Statuses where the request shape is the suspect rather than the credentials,
 * the model id or the quota. NIM proxies many different backends and
 * `response_format` is not honoured by every one of them — an unsupported
 * model rejects the whole request rather than ignoring the field. One retry
 * without it costs a round trip and rescues an otherwise dead deployment.
 */
const RETRY_WITHOUT_JSON_MODE = new Set([400, 415, 422, 500]);

/**
 * Statuses where a second attempt cannot possibly help, so spending the
 * remaining budget on one only delays the fallback. A rejected credential, an
 * unknown model or a malformed request is deterministic: it will be rejected
 * again, identically.
 */
const TERMINAL_STATUS = new Set([400, 401, 403, 404, 413, 415, 422]);

/** Marks a failure the retry loop must not re-attempt. */
class TerminalError extends Error {}

/**
 * A short, bounded reason off an error response — never the body itself.
 *
 * §12 is why this reads named keys instead of returning the raw text: an
 * OpenAI-compatible error body can echo the request back, and the request
 * contains the offer text. A request echo lives under `messages`, which is
 * never read here. What this does surface is the one sentence that actually
 * identifies the fault ("Model not found", "unsupported response_format"),
 * which is the difference between a diagnosable log line and "HTTP 400".
 */
async function errorDetail(response: Response): Promise<string> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return ""; // not JSON — say nothing rather than guess
  }

  const root = (body ?? {}) as Record<string, unknown>;
  for (const key of ["detail", "message", "title", "error"]) {
    const value = root[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 200);
    // OpenAI shape: { error: { message } }
    if (value && typeof value === "object") {
      const nested = (value as Record<string, unknown>).message;
      if (typeof nested === "string" && nested.trim()) return nested.trim().slice(0, 200);
    }
  }
  return "";
}

/**
 * The assistant's text, across the shapes NIM actually returns.
 *
 * `choices[0].message.content` is the ordinary one. Two others are real and
 * both used to surface here as the unhelpful "response carried no content":
 *
 *   - content as an array of parts, rather than a string.
 *   - content empty with the answer in `reasoning_content`. Reasoning-capable
 *     models on NIM do this, and since NVIDIA_MODEL can be pointed at one, a
 *     deployment can get a clean 200 whose text this function has to find.
 */
function readContent(body: unknown): string {
  const message = (body as { choices?: { message?: Record<string, unknown> }[] })
    ?.choices?.[0]?.message;
  if (!message) return "";

  const content = message.content;
  if (typeof content === "string" && content.trim()) return content;

  if (Array.isArray(content)) {
    const joined = content
      .map((part) =>
        typeof part === "string"
          ? part
          : typeof (part as { text?: unknown })?.text === "string"
            ? ((part as { text: string }).text)
            : "",
      )
      .join("");
    if (joined.trim()) return joined;
  }

  const reasoning = message.reasoning_content;
  if (typeof reasoning === "string" && reasoning.trim()) return reasoning;

  return "";
}

async function callNvidia(
  provider: NvidiaProvider,
  request: ChatRequest,
  budgetMs: number,
): Promise<string> {
  const attempt = async (jsonMode: boolean): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), budgetMs);

    try {
      return await fetch(provider.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // NVIDIA's own examples send this, and some NIM endpoints answer
          // with a streaming body without it.
          accept: "application/json",
          authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [{ role: "user", content: request.prompt }],
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          // An OpenAI-compatible hint, not a guarantee for every model in the
          // NIM catalog — which is why every caller parses through
          // extractJsonObject rather than trusting JSON.parse on the content,
          // and why an unsupported-format rejection is retried without it.
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
          ...provider.extraBody,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      // "This operation was aborted" names nothing an operator can act on.
      if (error instanceof Error && error.name === "AbortError") {
        // Prompt size is included because it is the one input we control and
        // the one an operator cannot otherwise see. A prefill far larger than
        // expected is a different problem from a slow queue.
        throw new Error(
          `timed out after ${budgetMs}ms (prompt ${request.prompt.length} chars)`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  let response = await attempt(true);

  if (!response.ok && RETRY_WITHOUT_JSON_MODE.has(response.status)) {
    const detail = await errorDetail(response);
    console.warn(
      `NVIDIA (${provider.model}) rejected the request with HTTP ${response.status}${
        detail ? ` — ${detail}` : ""
      }; retrying without response_format.`,
    );
    response = await attempt(false);
  }

  if (!response.ok) {
    const detail = await errorDetail(response);

    // A 401 is the one status where the useful fact is about our own request
    // rather than NVIDIA's answer. "Authentication failed" is true of a
    // revoked key AND of a valid key that arrived with an invisible character
    // on the end, and those need opposite fixes. The shape — length, six-char
    // prefix, what had to be stripped — separates them at a glance and
    // identifies nothing: six characters of an nvapi- key is the word
    // "nvapi-". The key itself is never logged.
    if (response.status === 401) {
      console.error(
        `NVIDIA rejected the credential. Key as the app received it: ` +
          `${describeKey(provider.apiKey, provider.keyNotes)}. ` +
          `If that length or prefix is not what you set, the value in the ` +
          `environment is not what you think it is — re-paste it. ` +
          `Otherwise the key is genuinely rejected for this endpoint or model.`,
      );
    }

    // 401 a bad or missing key, 404 a model id that is not in the catalog,
    // 429 a spent quota, 5xx NVIDIA being down.
    const message = `HTTP ${response.status}${detail ? ` — ${detail}` : ""}`;
    throw TERMINAL_STATUS.has(response.status)
      ? new TerminalError(message)
      : new Error(message);
  }

  const text = readContent(await response.json());
  if (!text) throw new Error("200 OK but the response carried no readable content");

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

  // Checked once, before any attempt: fetch would otherwise throw an opaque
  // "Invalid header value" from deep inside undici, naming no header.
  if (!isHeaderSafe(provider.apiKey)) {
    throw new AiUnavailableError(
      "NVIDIA_API_KEY contains characters that cannot go in an HTTP header " +
        "(non-ASCII or control characters). Re-copy it as plain text.",
    );
  }

  // Bounded by a deadline rather than a per-attempt timeout, because the thing
  // that must not be exceeded is the *function's* budget, not any one call's.
  // Two attempts against a stalled NVIDIA queue are worth more than one long
  // wait — a queue stall often clears on a second connection — but only while
  // there is enough time left for the second attempt to finish and for the
  // caller's own fallback to still run.
  const deadline = Date.now() + provider.deadlineMs;
  let lastReason = "unknown error";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = deadline - Date.now();
    const budget = Math.min(provider.attemptMs, remaining);
    if (budget < NVIDIA_MIN_RETRY_MS) break;

    try {
      const text = await callNvidia(provider, request, budget);
      if (attempt > 1) {
        console.warn(`NVIDIA (${provider.model}) succeeded on attempt ${attempt}.`);
      }
      return { value: validate(extractJsonObject(text)), model: provider.model };
    } catch (error) {
      lastReason = error instanceof Error ? error.message : "unknown error";

      // Logged per attempt: "attempt 1 timed out, attempt 2 answered" is the
      // signal that the queue is under pressure, and it is invisible from
      // outside because the product served a normal answer.
      console.error(
        `NVIDIA (${provider.model}) attempt ${attempt} failed: ${lastReason}`,
      );

      if (error instanceof TerminalError) {
        if (/^HTTP 401/.test(lastReason)) {
          // The one status where the useful fact is about our own request
          // rather than NVIDIA's answer. "Authentication failed" is true of a
          // revoked key AND of a valid key carrying an invisible character,
          // and those need opposite fixes. Shape identifies nothing: six
          // characters of an nvapi- key is the word "nvapi-".
          console.error(
            `NVIDIA rejected the credential. Key as the app received it: ` +
              `${describeKey(provider.apiKey, provider.keyNotes)}. ` +
              `If that length or prefix is not what you set, the value in the ` +
              `environment is not what you think it is — re-paste it.`,
          );
        }
        break; // deterministic; a retry would only delay the fallback
      }

      if (deadline - Date.now() < NVIDIA_MIN_RETRY_MS) {
        console.error(
          `NVIDIA (${provider.model}): no budget left to retry within the ` +
            `${provider.deadlineMs}ms deadline; falling back.`,
        );
        break;
      }
    }
  }

  throw new AiUnavailableError(lastReason);
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

/**
 * Fetches an inbound email's content from Resend's Received Emails API —
 * CLAUDE.md §5.3.
 *
 * Resend's `email.received` webhook carries metadata only: "Webhooks do not
 * include the email body, headers, or attachments, only their metadata. You
 * must call the Received emails API … to retrieve them." The intake used to
 * read `text`/`html` straight off the webhook, found nothing, and evaluated
 * every offer on its subject line alone. This is the call that was missing:
 *
 *   GET https://api.resend.com/emails/receiving/:email_id
 *
 * Kept free of `server-only`, Supabase and the logger so every branch can be
 * unit-tested with a stub fetch (received.test.ts). The caller logs; this
 * module only reports, and what it reports never contains the message body,
 * the API key or the provider's error text — just status codes and reasons.
 */

export const RECEIVED_EMAIL_ENDPOINT = "https://api.resend.com/emails/receiving";

/**
 * Per-attempt limits. The total is bounded separately by the caller's
 * `deadlineAt` (FETCH_BUDGET_MS in budget.ts for the webhook): an attempt never
 * runs past it, and no attempt starts with less than MIN_ATTEMPT_MS left.
 * Running out of budget is a *retryable* failure — Resend redelivers — never a
 * rejection, so a slow minute at Resend cannot turn into a lost offer.
 */
export const DEFAULT_TIMEOUT_MS = 4_000;
export const DEFAULT_ATTEMPTS = 2;
const DEFAULT_BACKOFF_MS = 300;
export const MIN_ATTEMPT_MS = 750;

/** A delivery larger than this is not an offer; refuse rather than parse it. */
export const MAX_RECEIVED_BYTES = 5 * 1024 * 1024;

/** Resend ids are UUIDs. Anything else never reaches the URL path. */
const EMAIL_ID = /^[A-Za-z0-9-]{1,100}$/;

export type ReceivedFetchFailure = {
  ok: false;
  /**
   * true  — a later attempt could succeed (timeout, 429, 5xx, a bad or missing
   *         API key an operator can fix); the delivery should stay retryable.
   * false — retrying cannot help (unknown id, malformed response).
   */
  retryable: boolean;
  /** Short, body-free reason, safe for inbound_emails.detail and logs. */
  reason: string;
  /** HTTP status of the last attempt, when there was one. */
  status: number | null;
  attempts: number;
};

export type ReceivedFetchResult =
  | { ok: true; email: Record<string, unknown>; attempts: number }
  | ReceivedFetchFailure;

export type FetchReceivedOptions = {
  apiKey?: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  attempts?: number;
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Absolute instant (ms) by which every attempt must have finished. */
  deadlineAt?: number;
  now?: () => number;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 401/403: the key is wrong or lacks access — fixable by an operator, so retryable. */
function isRetryableStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 408 || status === 429 || status >= 500;
}

export async function fetchReceivedEmail(
  emailId: string,
  options: FetchReceivedOptions = {},
): Promise<ReceivedFetchResult> {
  if (!EMAIL_ID.test(emailId)) {
    return { ok: false, retryable: false, reason: "invalid email id", status: null, attempts: 0 };
  }

  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Retryable: the provider keeps redelivering for a while, and a delivery
    // that arrives after the key is set should still become a deal room.
    return {
      ok: false,
      retryable: true,
      reason: "RESEND_API_KEY is not configured",
      status: null,
      attempts: 0,
    };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const deadlineAt = options.deadlineAt ?? Number.POSITIVE_INFINITY;
  const url = `${RECEIVED_EMAIL_ENDPOINT}/${encodeURIComponent(emailId)}`;

  let last: ReceivedFetchFailure = {
    ok: false,
    retryable: true,
    reason: "not attempted",
    status: null,
    attempts: 0,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      const pause = backoffMs * (attempt - 1);
      if (deadlineAt - now() - pause < MIN_ATTEMPT_MS) break;
      await sleep(pause);
    }

    const remaining = deadlineAt - now();
    if (remaining < MIN_ATTEMPT_MS) {
      if (attempt === 1) {
        return {
          ok: false,
          retryable: true,
          reason: "time budget exhausted before the request",
          status: null,
          attempts: 0,
        };
      }
      break;
    }

    const attemptMs = Math.min(timeoutMs, remaining);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), attemptMs);

    try {
      const response = await doFetch(url, {
        method: "GET",
        headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
        signal: controller.signal,
        // The content is fetched once per delivery; never serve it from a cache.
        cache: "no-store",
      });

      if (!response.ok) {
        // The response body is deliberately not read into the result: provider
        // error text is not ours to copy into a database row.
        last = {
          ok: false,
          retryable: isRetryableStatus(response.status),
          reason: `HTTP ${response.status}`,
          status: response.status,
          attempts: attempt,
        };
        if (!last.retryable) return last;
        continue;
      }

      const declared = Number(response.headers.get("content-length") ?? "");
      if (Number.isFinite(declared) && declared > MAX_RECEIVED_BYTES) {
        return { ok: false, retryable: false, reason: "response too large", status: response.status, attempts: attempt };
      }

      const raw = await response.text();
      if (raw.length > MAX_RECEIVED_BYTES) {
        return { ok: false, retryable: false, reason: "response too large", status: response.status, attempts: attempt };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // A 2xx that is not JSON is most likely a gateway's HTML page, which a
        // later attempt may not get.
        last = { ok: false, retryable: true, reason: "response was not JSON", status: response.status, attempts: attempt };
        continue;
      }

      const email = validateReceivedEmail(parsed, emailId);
      if (!email) {
        return { ok: false, retryable: false, reason: "malformed response", status: response.status, attempts: attempt };
      }

      return { ok: true, email, attempts: attempt };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      last = {
        ok: false,
        retryable: true,
        reason: aborted ? `timed out after ${attemptMs}ms` : "network error",
        status: null,
        attempts: attempt,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return last;
}

/**
 * The documented response is an object with `object: "email"` and the `id`
 * that was asked for. Anything else — an array, a different id, a different
 * object type — is refused rather than trusted, because whatever it contains
 * would be shown in a creator's deal room as the sponsor's message.
 */
export function validateReceivedEmail(
  parsed: unknown,
  emailId: string,
): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  if (o.object !== undefined && o.object !== "email") return null;
  if (o.id !== undefined && o.id !== emailId) return null;
  if (o.text !== undefined && o.text !== null && typeof o.text !== "string") return null;
  if (o.html !== undefined && o.html !== null && typeof o.html !== "string") return null;
  return o;
}

/**
 * The outbound relay lifecycle (migration 0036). The database owns the state
 * (relay_claim / relay_record); this sequences one attempt and decides
 * whether a failure is worth retrying. Pure apart from injected deps —
 * tested in relay-lifecycle.test.ts with a fake provider.
 *
 * In-app notifications (0030) are a separate channel: they say a message
 * exists, never that an email was delivered. Only relay_status = 'sent'
 * with a provider id means the provider accepted the email.
 */

export type RelayFailure = { ok: false; error: string; status?: number };
export type RelaySend = { ok: true; providerId: string | null } | RelayFailure;

/**
 * Permanent: the request itself is wrong and will fail the same way again
 * (400/401/403/404/422). Transient: rate limits, provider errors, timeouts,
 * network failures, a 409 idempotency conflict (a concurrent attempt), and a
 * missing API key (fixed by configuration, then retried).
 */
export function isPermanentFailure(f: RelayFailure): boolean {
  if (f.status === undefined) return false;
  if (f.status === 409 || f.status === 429) return false;
  return f.status >= 400 && f.status < 500;
}

/** A provider idempotency key per message: a retry after an unrecorded success is not a second email. */
export function relayIdempotencyKey(messageId: string): string {
  return `gl-relay-${messageId}`;
}

export type RelayDeps = {
  claim(messageId: string): Promise<boolean>;
  send(messageId: string, idempotencyKey: string): Promise<RelaySend>;
  record(messageId: string, result: { ok: boolean; providerId: string | null; error: string | null; permanent: boolean }): Promise<string | null>;
};

export type RelayOutcome = "sent" | "failed_retryable" | "failed_permanent" | "skipped" | "unrecorded";

export async function runRelay(deps: RelayDeps, messageId: string): Promise<RelayOutcome> {
  if (!(await deps.claim(messageId))) return "skipped";
  const result = await deps.send(messageId, relayIdempotencyKey(messageId));
  const status = await deps.record(
    messageId,
    result.ok
      ? { ok: true, providerId: result.providerId, error: null, permanent: false }
      : { ok: false, providerId: null, error: result.error, permanent: isPermanentFailure(result) },
  );
  if (status === null) return "unrecorded";
  return status as RelayOutcome;
}

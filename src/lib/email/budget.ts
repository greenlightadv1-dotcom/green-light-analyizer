import { REQUIRED_MAX_DURATION } from "../ai/nvidia-config.ts";

/**
 * Time budget for one inbound webhook request — CLAUDE.md §5.3.
 *
 * The route runs under `maxDuration = 60` (the Vercel Hobby ceiling; raising
 * it is not available on that plan, and it is the same value every AI route
 * declares, see REQUIRED_MAX_DURATION). A function killed at the limit returns
 * nothing and leaves its claim behind, so the work must be planned to finish
 * inside it, measured from when the request arrived — not from when each step
 * happens to start, which is how the parts used to add up to 59–61s:
 *
 *   arrival ──┬─ claim + creator lookups ─┬─ content fetch ≤ FETCH_BUDGET ─┬─ model ─┐
 *             0                                                                     │
 *             └──────────────── INTAKE_BUDGET (52s): the model must stop here ──────┘
 *                                            then ≤ POST_EVALUATION_RESERVE (8s):
 *                                            room, messages, violation log, response
 *
 * The model's own 50s deadline still applies; the request deadline only ever
 * shortens it. When it runs short the evaluator falls back to its labelled
 * rule-based estimate rather than failing the delivery.
 *
 * Database calls carry no client-side timeout (supabase-js sets none), so a
 * database stall can still exceed the limit; the reserve covers ordinary
 * latency only.
 */
export const ROUTE_MAX_DURATION_MS = REQUIRED_MAX_DURATION * 1000;

/** Left after the model stops, for the writes and the response. */
export const POST_EVALUATION_RESERVE_MS = 8_000;

/** From arrival to the moment the model must have stopped. */
export const INTAKE_BUDGET_MS = ROUTE_MAX_DURATION_MS - POST_EVALUATION_RESERVE_MS;

/**
 * The most the Resend content fetch may take, retries included. Resend answers
 * in well under a second when healthy; beyond this the delivery is handed back
 * to Resend's own retry schedule (a retryable failure, never a rejection)
 * rather than eating the model's time.
 */
export const FETCH_BUDGET_MS = 6_000;

export function intakeDeadline(startedAt: number): number {
  return startedAt + INTAKE_BUDGET_MS;
}

/** The fetch stops at whichever comes first: its own budget or the intake's. */
export function fetchDeadline(now: number, intakeDeadlineAt: number): number {
  return Math.min(now + FETCH_BUDGET_MS, intakeDeadlineAt);
}

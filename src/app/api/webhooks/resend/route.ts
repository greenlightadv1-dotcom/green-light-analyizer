import { NextResponse } from "next/server";
import { processInboundEmail } from "@/lib/email/intake";
import { normalizeInboundEmail } from "@/lib/email/parse";
import { verifyWebhookSignature } from "@/lib/email/verify";
import { intakeDeadline } from "@/lib/email/budget";
import { webhookResponseFor } from "@/lib/email/webhook-response";
import { log } from "@/lib/log";

/**
 * Resend inbound-email webhook — CLAUDE.md §5.3.
 *
 * The one public, unauthenticated write path in the product. Nothing is read,
 * parsed or acted on before the signature verifies.
 *
 * Response policy: 200 for anything we have decided about — including a
 * delivery we deliberately refuse — and non-2xx only when a retry could
 * actually help. Returning 4xx for "unknown alias" would have the provider
 * redeliver a message that will never resolve, for as long as its retry
 * schedule runs.
 */

// Signature verification needs the byte-exact body, so nothing may re-encode
// the request before this handler sees it.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/**
 * The content fetch and then the NVIDIA call run synchronously while this
 * route turns an offer into a deal room. Vercel's default function timeout is
 * under that, so without this the platform would kill the request mid-call —
 * and a killed function returns nothing at all, not even the rule-based
 * estimate the fallback exists to provide. 60s is the Hobby-plan ceiling; the
 * intake plans its own work inside it from the request's arrival
 * (lib/email/budget.ts), which is why the deadline is taken first thing.
 */
export const maxDuration = 60;

const MAX_BODY_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const deadlineAt = intakeDeadline(Date.now());
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;

  if (!secret) {
    // Refuse rather than fall open. An endpoint that accepts unsigned mail
    // because a variable is unset is worse than one that is simply off.
    log.error("resend_webhook.unconfigured", { missing: "RESEND_INBOUND_WEBHOOK_SECRET" });
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const raw = await request.text();

  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  const verification = verifyWebhookSignature({
    secret,
    id: request.headers.get("svix-id") ?? request.headers.get("webhook-id"),
    timestamp:
      request.headers.get("svix-timestamp") ??
      request.headers.get("webhook-timestamp"),
    signatureHeader:
      request.headers.get("svix-signature") ??
      request.headers.get("webhook-signature"),
    body: raw,
  });

  if (!verification.ok) {
    // The reason goes to our logs, never to the caller: telling an attacker
    // whether they got the timestamp or the digest wrong is free help.
    log.warn("resend_webhook.signature_rejected", { reason: verification.reason });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Only received mail is intake. Any other event this endpoint is subscribed
  // to (now or by a later dashboard change) is acknowledged and left alone —
  // its email_id is a *sent* email, and fetching it as received would only 404.
  const eventType =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>).type : undefined;
  if (typeof eventType === "string" && eventType !== "email.received") {
    return NextResponse.json({ status: "ignored" });
  }

  try {
    // Inside the guard: normalizeInboundEmail tolerates any shape, and the
    // intake fetches the body from Resend's Received Emails API, which can
    // fail in ways that must not escape as an unhandled error.
    const outcome = await processInboundEmail(normalizeInboundEmail(payload), { deadlineAt });
    const { httpStatus, headers } = webhookResponseFor(outcome.status);

    if (outcome.status === "failed") {
      // Genuinely our fault and possibly transient — let the provider retry.
      log.error("resend_webhook.intake_failed", { detail: outcome.detail });
    }
    if (httpStatus !== 200) {
      // in_progress was already logged by the intake, with the claim's age.
      return NextResponse.json({ status: outcome.status }, { status: httpStatus, headers });
    }

    // A delivery we decided about but did not act on still has to be visible.
    // A misrouted receiving domain, or an alias nobody owns, refuses every
    // message while answering 200 — from the outside that is indistinguishable
    // from a healthy endpoint, and the first symptom is a creator asking where
    // their offers went.
    if (outcome.status === "rejected" || outcome.status === "unknown_alias") {
      log.warn("resend_webhook.not_delivered", { status: outcome.status, detail: outcome.detail });
    }

    return NextResponse.json({ status: outcome.status, chat_id: outcome.chatId ?? null });
  } catch (error) {
    log.error("resend_webhook.unhandled", { error });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}

/** A GET is almost always a human checking the URL. Say nothing useful. */
export function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}

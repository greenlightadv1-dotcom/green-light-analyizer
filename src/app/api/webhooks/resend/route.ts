import { NextResponse } from "next/server";
import { processInboundEmail } from "@/lib/email/intake";
import { normalizeInboundEmail } from "@/lib/email/parse";
import { verifyWebhookSignature } from "@/lib/email/verify";

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

const MAX_BODY_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;

  if (!secret) {
    // Refuse rather than fall open. An endpoint that accepts unsigned mail
    // because a variable is unset is worse than one that is simply off.
    console.error("resend webhook: RESEND_INBOUND_WEBHOOK_SECRET is not set");
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
    console.warn(`resend webhook: rejected — ${verification.reason}`);
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const email = normalizeInboundEmail(payload);

  try {
    const outcome = await processInboundEmail(email);

    if (outcome.status === "failed") {
      // Genuinely our fault and possibly transient — let the provider retry.
      console.error(`resend webhook: ${outcome.detail}`);
      return NextResponse.json({ status: outcome.status }, { status: 500 });
    }

    return NextResponse.json({ status: outcome.status, chat_id: outcome.chatId ?? null });
  } catch (error) {
    console.error("resend webhook: unhandled failure", error);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}

/** A GET is almost always a human checking the URL. Say nothing useful. */
export function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}

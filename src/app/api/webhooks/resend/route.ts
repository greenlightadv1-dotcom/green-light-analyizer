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
/**
 * The AI provider chain (lib/ai/provider-chain.ts) budgets ~32s worst case
 * before it gives up, and this route waits on it synchronously while turning
 * an offer into a deal room. Vercel's default function timeout is well under
 * that, so without this the platform would kill the request mid-attempt — and
 * a function killed during the primary provider never reaches the fallback,
 * which makes the failover decorative on exactly the path that matters most.
 * 60s is the Hobby-plan ceiling.
 */
export const maxDuration = 60;

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

  try {
    // Inside the guard: normalizeInboundEmail is written to tolerate any shape,
    // but "written to" is not "proven to" against a provider payload this code
    // has never been pinned against.
    const outcome = await processInboundEmail(normalizeInboundEmail(payload));

    if (outcome.status === "failed") {
      // Genuinely our fault and possibly transient — let the provider retry.
      console.error(`resend webhook: ${outcome.detail}`);
      return NextResponse.json({ status: outcome.status }, { status: 500 });
    }

    // A delivery we decided about but did not act on still has to be visible.
    // A misrouted receiving domain, or an alias nobody owns, refuses every
    // message while answering 200 — from the outside that is indistinguishable
    // from a healthy endpoint, and the first symptom is a creator asking where
    // their offers went.
    if (outcome.status === "rejected" || outcome.status === "unknown_alias") {
      console.warn(`resend webhook: ${outcome.status} — ${outcome.detail}`);
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

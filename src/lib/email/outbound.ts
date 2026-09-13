import "server-only";

import { INBOUND_DOMAIN } from "@/lib/alias";
import { escapeHtml, relaySubject } from "./format";

/**
 * Outbound relay — CLAUDE.md §6.
 *
 * "When a creator replies in-app, the reply is relayed to the company as an
 *  official email sent from the platform's own server — the company never sees
 *  the creator's real address, only the platform's sending address."
 *
 * Two rules this module exists to keep:
 *
 *   1. `from` is always the platform. The creator's primary_email is never
 *      read here, never passed in, and cannot leak into a header by accident —
 *      the function signature has nowhere to put it.
 *
 *   2. `reply_to` is the creator's §5.1 inbound alias, not their real address.
 *      That is what closes the loop: the company replies, the reply lands on
 *      the alias, Resend webhooks it back, and the intake appends it to the
 *      same deal room. The company only ever holds a platform-controlled
 *      address, which can be rotated if it is ever abused.
 */

export type RelayResult =
  | { ok: true; providerId: string | null }
  | { ok: false; error: string };

/** Sending identity. A subdomain of the inbound domain by default. */
function fromAddress(): string {
  return (
    process.env.RESEND_FROM_ADDRESS ?? `Green Light <deals@${INBOUND_DOMAIN}>`
  );
}

/**
 * Relay one message to the company.
 *
 * `body` must already be the MASKED text. This function does not mask — by the
 * time a message reaches here it has been through the §6.1 filter and been
 * persisted, and re-masking would only hide a bug in that ordering.
 */
export async function relayMessageToCompany({
  to,
  subject,
  body,
  creatorDisplayName,
  creatorAlias,
}: {
  /** The company's address, from deal_chats.sender_email. */
  to: string;
  subject: string;
  /** Masked message text. */
  body: string;
  /** Shown as the sender's name. Never their email. */
  creatorDisplayName: string;
  /** The creator's inbound alias — the reply path back into the platform. */
  creatorAlias: string | null;
}): Promise<RelayResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }

  const footer =
    "You are corresponding through Green Light. Replying to this email keeps the conversation, and the payment protection, on the platform.";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [to],
        // Falls back to the platform address rather than omitting reply_to:
        // a reply that bounces is better than one routed somewhere unintended.
        reply_to: creatorAlias ?? fromAddress(),
        subject,
        text: `${creatorDisplayName} replied:\n\n${body}\n\n—\n${footer}`,
        html: `<p><strong>${escapeHtml(creatorDisplayName)}</strong> replied:</p><p style="white-space:pre-wrap">${escapeHtml(body)}</p><hr><p style="color:#666;font-size:12px">${escapeHtml(footer)}</p>`,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Resend returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      };
    }

    const payload = (await response.json().catch(() => null)) as {
      id?: string;
    } | null;

    return { ok: true, providerId: payload?.id ?? null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "relay failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export { relaySubject };

import "server-only";

/**
 * WhatsApp notification delivery for Settings' "Receive Instant WhatsApp
 * Notifications for New Deals" toggle (migration 0017:
 * profiles.whatsapp_number / whatsapp_notifications_enabled).
 *
 * Not in CLAUDE.md §9's tech stack — WhatsApp there is only a static support
 * link (§4). This is new, genuinely optional infrastructure, built to the
 * same contract as every other optional integration in this codebase
 * (Resend, NVIDIA, YouTube, the OAuth connections): missing configuration
 * degrades quietly to a typed result, never a thrown error that could break
 * the deal-creation path calling it.
 *
 * Uses Meta's WhatsApp Business Cloud API directly via fetch, matching this
 * codebase's standing preference for a direct call over an SDK dependency in
 * a request path (see email/verify.ts's doc comment for the same reasoning).
 */

export type WhatsAppSendResult = { ok: true } | { ok: false; reason: string };

/** E.164-ish check: leading +, 8-15 digits. Good enough to catch a typo before an API round trip. */
const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

export function isValidWhatsAppNumber(value: string): boolean {
  return PHONE_REGEX.test(value.trim());
}

/**
 * Sends one WhatsApp text message via the Cloud API. Resolves with
 * `{ ok: false }` rather than throwing when unconfigured, the number is
 * invalid, or the API call fails — callers may inspect the result, but a
 * notification failing must never be the reason the deal-creation path that
 * triggered it fails too.
 */
export async function sendWhatsAppNotification(
  toNumber: string,
  message: string,
): Promise<WhatsAppSendResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    console.warn("whatsapp: WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID not set — skipping notification");
    return { ok: false, reason: "not configured" };
  }

  if (!isValidWhatsAppNumber(toNumber)) {
    return { ok: false, reason: "invalid recipient number" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toNumber.trim().replace(/^\+/, ""),
          type: "text",
          text: { body: message },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      console.error(`whatsapp: send failed with ${response.status}`);
      return { ok: false, reason: `WhatsApp API returned ${response.status}` };
    }

    return { ok: true };
  } catch (error) {
    console.error("whatsapp: send failed", error);
    return { ok: false, reason: error instanceof Error ? error.message : "network error" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fire-and-forget notification for a new deal — called from every
 * deal-creation path (email intake, Manual Analyzer, Discover offers). Never
 * awaited by its caller for anything beyond kicking it off: a slow or failed
 * WhatsApp call must not delay the response the creator or company is
 * actually waiting on.
 */
export function notifyNewDeal(profile: {
  whatsapp_number: string | null;
  whatsapp_notifications_enabled: boolean;
}, dealSummary: string): void {
  if (!profile.whatsapp_notifications_enabled || !profile.whatsapp_number) return;
  void sendWhatsAppNotification(
    profile.whatsapp_number,
    `Green Light: ${dealSummary}`,
  );
}

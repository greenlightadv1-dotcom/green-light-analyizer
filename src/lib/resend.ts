import "server-only";

import { createElement, type ReactElement } from "react";
import { render } from "@react-email/render";
import {
  CreatorOutreach,
  type CreatorOutreachProps,
} from "@/components/emails/CreatorOutreach";
import {
  SystemNotification,
  type SystemNotificationProps,
} from "@/components/emails/SystemNotification";

/**
 * Resend dispatcher for the React Email templates in src/components/emails.
 *
 * Separate from src/lib/email/outbound.ts: that module relays a creator's
 * in-app reply to a company as the masked-chat identity (§6) and must never
 * take an arbitrary `from`. This module sends a different category of mail —
 * outreach and system notifications — and defaults to Resend's shared,
 * pre-verified `onboarding@resend.dev` sender so it works before any custom
 * domain is verified in Resend.
 *
 * Same "degrade quietly" contract as outbound.ts: a missing key or a failed
 * send returns a typed error, never throws — a notification failing must
 * never be the reason the caller's own action fails.
 */

export type SendResult =
  | { ok: true; providerId: string | null }
  | { ok: false; error: string };

const DEFAULT_FROM = "Green Light <onboarding@resend.dev>";
const TIMEOUT_MS = 15_000;

async function sendRenderedEmail({
  to,
  from,
  subject,
  element,
}: {
  to: string;
  from?: string;
  subject: string;
  element: ReactElement;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }

  let html: string;
  let text: string;
  try {
    [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `template render failed: ${error.message}` : "template render failed",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: from ?? DEFAULT_FROM,
        to: [to],
        subject,
        html,
        text,
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

    const payload = (await response.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, providerId: payload?.id ?? null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "send failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendCreatorOutreach({
  to,
  from,
  ...props
}: CreatorOutreachProps & { to: string; from?: string }): Promise<SendResult> {
  return sendRenderedEmail({
    to,
    from,
    subject: `${props.campaignTitle} — $${props.offerAmountUsd.toLocaleString("en-US")} offer`,
    element: createElement(CreatorOutreach, props),
  });
}

export async function sendSystemNotification({
  to,
  from,
  ...props
}: SystemNotificationProps & { to: string; from?: string }): Promise<SendResult> {
  return sendRenderedEmail({
    to,
    from,
    subject: props.title,
    element: createElement(SystemNotification, props),
  });
}

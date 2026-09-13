import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";
import { sendCreatorOutreach, sendSystemNotification } from "@/lib/resend";
import type { NotificationTone } from "@/components/emails/SystemNotification";

/**
 * Admin-triggered email send — the HTTP front door onto src/lib/resend.ts's
 * two dispatchers.
 *
 * Unlike the two webhook receivers in this app (Resend inbound, Supabase
 * Database Webhooks), the caller here is a person, not another service, so
 * this is authenticated the same way every other admin surface is (§3: admin
 * is the only trusted role) — an active Supabase session with role "admin" —
 * rather than a bearer-secret scheme. requireRole() from lib/auth.ts isn't
 * reused here because it redirects on failure, which is right for a page and
 * wrong for a JSON API: a fetch caller needs a 401/403 body, not a 307 to
 * /login.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_TEXT_LEN = 10_000;

type CreatorOutreachBody = {
  type: "creator_outreach";
  to: string;
  creatorName: string;
  campaignTitle: string;
  offerAmountUsd: number;
  pitchDetails: string;
  ctaLabel: string;
  ctaUrl: string;
  secondaryCtaLabel?: string;
  secondaryCtaUrl?: string;
  from?: string;
};

type SystemNotificationBody = {
  type: "system_notification";
  to: string;
  title: string;
  message: string;
  tone?: NotificationTone;
  ctaLabel?: string;
  ctaUrl?: string;
  from?: string;
};

type SendEmailBody = CreatorOutreachBody | SystemNotificationBody;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TONES: NotificationTone[] = ["info", "success", "warning", "error"];

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function nonEmptyString(value: unknown, maxLen = 500): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLen;
}

/** Validates the discriminated request body by hand — no schema library in this project's dependency graph. */
function validate(payload: unknown): { ok: true; body: SendEmailBody } | { ok: false; error: string } {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const p = payload as Record<string, unknown>;

  if (!nonEmptyString(p.to, 320) || !EMAIL_REGEX.test(p.to)) {
    return { ok: false, error: "'to' must be a valid email address" };
  }
  if (p.from !== undefined && !nonEmptyString(p.from, 320)) {
    return { ok: false, error: "'from' must be a non-empty string" };
  }

  if (p.type === "creator_outreach") {
    if (!nonEmptyString(p.creatorName, 200)) return { ok: false, error: "'creatorName' is required" };
    if (!nonEmptyString(p.campaignTitle, 200)) return { ok: false, error: "'campaignTitle' is required" };
    if (typeof p.offerAmountUsd !== "number" || !Number.isFinite(p.offerAmountUsd) || p.offerAmountUsd < 0) {
      return { ok: false, error: "'offerAmountUsd' must be a non-negative number" };
    }
    if (!nonEmptyString(p.pitchDetails, MAX_TEXT_LEN)) return { ok: false, error: "'pitchDetails' is required" };
    if (!nonEmptyString(p.ctaLabel, 100)) return { ok: false, error: "'ctaLabel' is required" };
    if (!isHttpUrl(p.ctaUrl)) return { ok: false, error: "'ctaUrl' must be an http(s) URL" };
    if (p.secondaryCtaLabel !== undefined && !nonEmptyString(p.secondaryCtaLabel, 100)) {
      return { ok: false, error: "'secondaryCtaLabel' must be a non-empty string" };
    }
    if (p.secondaryCtaUrl !== undefined && !isHttpUrl(p.secondaryCtaUrl)) {
      return { ok: false, error: "'secondaryCtaUrl' must be an http(s) URL" };
    }

    return {
      ok: true,
      body: {
        type: "creator_outreach",
        to: p.to,
        from: p.from,
        creatorName: p.creatorName,
        campaignTitle: p.campaignTitle,
        offerAmountUsd: p.offerAmountUsd,
        pitchDetails: p.pitchDetails,
        ctaLabel: p.ctaLabel,
        ctaUrl: p.ctaUrl,
        secondaryCtaLabel: p.secondaryCtaLabel as string | undefined,
        secondaryCtaUrl: p.secondaryCtaUrl as string | undefined,
      },
    };
  }

  if (p.type === "system_notification") {
    if (!nonEmptyString(p.title, 200)) return { ok: false, error: "'title' is required" };
    if (!nonEmptyString(p.message, MAX_TEXT_LEN)) return { ok: false, error: "'message' is required" };
    if (p.tone !== undefined && !TONES.includes(p.tone as NotificationTone)) {
      return { ok: false, error: `'tone' must be one of: ${TONES.join(", ")}` };
    }
    if (p.ctaLabel !== undefined && !nonEmptyString(p.ctaLabel, 100)) {
      return { ok: false, error: "'ctaLabel' must be a non-empty string" };
    }
    if (p.ctaUrl !== undefined && !isHttpUrl(p.ctaUrl)) {
      return { ok: false, error: "'ctaUrl' must be an http(s) URL" };
    }
    if ((p.ctaLabel === undefined) !== (p.ctaUrl === undefined)) {
      return { ok: false, error: "'ctaLabel' and 'ctaUrl' must be given together" };
    }

    return {
      ok: true,
      body: {
        type: "system_notification",
        to: p.to,
        from: p.from,
        title: p.title,
        message: p.message,
        tone: p.tone as NotificationTone | undefined,
        ctaLabel: p.ctaLabel as string | undefined,
        ctaUrl: p.ctaUrl as string | undefined,
      },
    };
  }

  return { ok: false, error: "'type' must be 'creator_outreach' or 'system_notification'" };
}

export async function POST(request: Request) {
  // createClient() throws on a blank/malformed URL or key rather than
  // returning a client that just fails requests — checked first so a bad
  // deployment config is a clean 503, not an unhandled 500 that also skips
  // straight past the auth check below.
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  let role: string | null = null;
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    role = profile?.role ?? null;
  } catch (error) {
    // A reachability problem (paused project, DNS, transient outage) is not
    // this caller's fault, but it still must not read as "authenticated" —
    // fail closed rather than let an exception here fall through to the
    // handler below with no session established.
    console.error("emails/send: auth check failed", error);
    return NextResponse.json({ error: "auth check failed" }, { status: 503 });
  }

  if (role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const validated = validate(parsed);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { body } = validated;
  const result =
    body.type === "creator_outreach"
      ? await sendCreatorOutreach(body)
      : await sendSystemNotification(body);

  if (!result.ok) {
    const status = result.error === "RESEND_API_KEY is not configured" ? 503 : 502;
    console.error(`emails/send: ${result.error}`);
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ status: "sent", providerId: result.providerId });
}

/** A GET is almost always a human checking the URL. Say nothing useful. */
export function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}

import { NextResponse, type NextRequest } from "next/server";
import { sendCreatorOutreach } from "@/lib/resend";
import { siteUrl } from "@/lib/constants/site";

/**
 * Development-only harness for the Resend pipeline (§9).
 *
 * This replaces a standalone `node scripts/send-test.ts`, which could never
 * have run: src/lib/resend.ts opens with `import "server-only"`, which throws
 * by design outside a React Server Component, and it imports through the `@/`
 * alias that a bare node process does not resolve. Inside a route handler
 * both are ordinary.
 *
 * Sending is the one part of the email stack that cannot be unit-tested — it
 * needs a live RESEND_API_KEY and a real inbox — so this exists to make that
 * one check a single command rather than a rebuild.
 *
 *   curl -sS -X POST http://localhost:3000/api/dev/send-test \
 *     -H 'content-type: application/json' \
 *     -d '{"to":"you@example.com"}'
 *
 * Every template field can be overridden in the body; the defaults are
 * deliberately Arabic so one call also exercises RTL rendering in the email
 * client, which the app's own RTL work (§15) does not cover.
 *
 * `to` is required rather than defaulted: a harness that emails a hardcoded
 * address on every call eventually emails it by accident.
 */
export async function POST(request: NextRequest) {
  // 404, not 403: in production this route should not appear to exist. The
  // proxy matcher also skips /api/dev, so this check is the only gate.
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!to) {
    return NextResponse.json(
      { error: 'Pass a recipient, e.g. {"to":"you@example.com"}.' },
      { status: 400 },
    );
  }

  const str = (key: string, fallback: string): string => {
    const value = body[key];
    return typeof value === "string" && value.trim() ? value : fallback;
  };

  const result = await sendCreatorOutreach({
    to,
    creatorName: str("creatorName", "أيمن"),
    campaignTitle: str("campaignTitle", "حملة إعلانية تجريبية — Green Light"),
    offerAmountUsd:
      typeof body.offerAmountUsd === "number" ? body.offerAmountUsd : 1500,
    pitchDetails: str(
      "pitchDetails",
      "اختبار محرك الإرسال وقوالب البريد الإلكتروني المباشر.",
    ),
    ctaLabel: str("ctaLabel", "عرض التفاصيل"),
    ctaUrl: str("ctaUrl", siteUrl()),
  });

  // 502 on failure so a non-zero curl exit is possible with -f; the body
  // still carries Resend's own error string rather than a generic message.
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

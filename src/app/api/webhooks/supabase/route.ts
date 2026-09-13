import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendDiscordLog, type DiscordLogStatus } from "@/lib/discord/logger";

/**
 * Supabase Database Webhook receiver (Database → Webhooks in the Supabase
 * dashboard). Posts a Discord notification for every configured table
 * change; this endpoint never touches the database itself.
 *
 * Supabase's Database Webhooks don't sign deliveries the way Resend/Svix do
 * (see ../resend/route.ts) — the dashboard instead lets you attach custom
 * HTTP headers to every call. Configure the webhook there with:
 *   Authorization: Bearer <SUPABASE_WEBHOOK_SECRET>
 * and this handler compares it in constant time.
 *
 * Response policy: 200 once the delivery is authenticated and shaped like a
 * real payload, whether or not the Discord post itself succeeded. A bad or
 * missing DISCORD_SUPABASE_WEBHOOK_URL is our config problem, not something a
 * Supabase retry could fix, so failing the delivery here would only make
 * Supabase re-send the same row forever.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 1 * 1024 * 1024;

type SupabasePayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
};

const STATUS_BY_TYPE: Record<SupabasePayload["type"], DiscordLogStatus> = {
  INSERT: "success",
  UPDATE: "info",
  DELETE: "warning",
};

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function isAuthorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  return safeEqual(header, `Bearer ${secret}`);
}

function normalizePayload(payload: unknown): SupabasePayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;

  if (p.type !== "INSERT" && p.type !== "UPDATE" && p.type !== "DELETE") return null;
  if (typeof p.table !== "string") return null;

  return {
    type: p.type,
    table: p.table,
    schema: typeof p.schema === "string" ? p.schema : "public",
    record: (p.record as Record<string, unknown> | null) ?? null,
    old_record: (p.old_record as Record<string, unknown> | null) ?? null,
  };
}

export async function POST(request: Request) {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET;

  if (!secret) {
    // Refuse rather than fall open — see resend/route.ts for the same call.
    console.error("supabase webhook: SUPABASE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  if (!isAuthorized(request, secret)) {
    console.warn("supabase webhook: rejected — missing or invalid Authorization header");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  const payload = normalizePayload(parsed);
  if (!payload) {
    return NextResponse.json({ error: "unrecognized payload shape" }, { status: 400 });
  }

  const row = payload.type === "DELETE" ? payload.old_record : payload.record;

  const result = await sendDiscordLog({
    channel: "supabase",
    title: `${payload.type} · ${payload.schema}.${payload.table}`,
    status: STATUS_BY_TYPE[payload.type],
    fields: [
      { name: "Table", value: `${payload.schema}.${payload.table}`, inline: true },
      { name: "Event", value: payload.type, inline: true },
      { name: "Row", value: row ? "```json\n" + JSON.stringify(row, null, 2) + "\n```" : "—" },
    ],
  });

  return NextResponse.json({ status: "received", notified: result.ok });
}

/** A GET is almost always a human checking the URL. Say nothing useful. */
export function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}

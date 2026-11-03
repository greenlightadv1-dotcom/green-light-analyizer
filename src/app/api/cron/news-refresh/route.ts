import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { log } from "@/lib/log";
import { newsEnabled } from "@/lib/news/sources";
import { refreshNews } from "@/lib/news/refresh";

/**
 * Scheduled news refresh (0037). Off unless CRON_SECRET is set AND
 * NEWS_MONITORING_ENABLED=1, and NOT registered in vercel.json: scheduling
 * is a Vercel configuration change that needs approval. No monitoring runs
 * until then; an admin can refresh by hand at /admin/news.
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!newsEnabled()) return NextResponse.json({ ok: true, enabled: false });
  const results = await refreshNews();
  log.info("news.refresh_run", { sources: results.length, stored: results.reduce((s, r) => s + r.stored, 0) });
  return NextResponse.json({ ok: true, enabled: true, results });
}

import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { log } from "@/lib/log";
import { processDueRelays } from "@/lib/email/relay-queue";

/**
 * Retry outbound relays that are due (0036). Refuses every caller without
 * CRON_SECRET, like every cron route. NOT registered in vercel.json:
 * scheduling it is a Vercel configuration change that needs approval. Until
 * then, retries run from /admin/relays.
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const counts = await processDueRelays();
  log.info("relay_retry.run", counts);
  return NextResponse.json(counts);
}

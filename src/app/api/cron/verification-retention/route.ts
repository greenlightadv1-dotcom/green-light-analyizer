import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { log } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPurgeable, retentionConfig, retentionCutoff } from "@/lib/verification/retention";
import { BUCKET } from "@/lib/verification/documents-server";

/**
 * Purge verification documents past the retention period
 * (lib/verification/retention.ts, docs/IDENTITY_DOCUMENT_SECURITY.md).
 *
 * OFF until BOTH are set: CRON_SECRET (like every cron route) and
 * VERIFICATION_RETENTION_DAYS, which is an owner/legal decision not yet made.
 * It is deliberately NOT registered in vercel.json: scheduling it is a Vercel
 * configuration change that needs approval. Until then nothing is deleted.
 *
 * Deletes the stored files of decided or abandoned cases only, marks the
 * document rows removed (metadata stays as the audit trail), and records a
 * 'document_purged' event per file. Cases awaiting review are never touched.
 */
export const maxDuration = 60;
const BATCH = 200;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const config = retentionConfig();
  if (!config.enabled) return NextResponse.json({ ok: true, enabled: false, purged: 0 });

  const cutoff = retentionCutoff(config.days);
  const service = createAdminClient();
  const { data: cases, error } = await service
    .from("verification_cases")
    .select("id, status, reviewed_at, updated_at")
    .in("status", ["approved", "rejected", "draft"])
    .lt("updated_at", cutoff)
    .limit(BATCH);
  if (error) {
    log.error("verification_retention.query_failed", { error });
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  const due = (cases ?? []).filter((c) => isPurgeable(c, cutoff)).map((c) => c.id);
  if (!due.length) return NextResponse.json({ ok: true, enabled: true, purged: 0 });
  const { data: docs } = await service
    .from("verification_documents")
    .select("id, case_id, storage_path, doc_type")
    .in("case_id", due)
    .is("removed_at", null)
    .limit(BATCH);
  let purged = 0;
  for (const d of docs ?? []) {
    const { error: rmErr } = await service.storage.from(BUCKET).remove([d.storage_path]);
    if (rmErr) {
      log.error("verification_retention.remove_failed", { error: rmErr });
      continue;
    }
    await service.from("verification_documents").update({ removed_at: new Date().toISOString() }).eq("id", d.id);
    await service.from("verification_events").insert({ case_id: d.case_id, actor_id: null, event: "document_purged", detail: { doc_type: d.doc_type, retention_days: config.days } });
    purged++;
  }
  log.info("verification_retention.run", { purged, days: config.days });
  return NextResponse.json({ ok: true, enabled: true, purged });
}

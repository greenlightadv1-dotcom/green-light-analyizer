import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { log } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { RETENTION_DAYS, isPurgeable, retentionCutoff } from "@/lib/verification/retention";
import { runPurge } from "@/lib/verification/purge";
import { BUCKET } from "@/lib/verification/documents-server";

/**
 * Daily purge of verification documents past the approved 12-month retention
 * period (365 days; lib/verification/retention.ts, lib/verification/purge.ts).
 *
 * Scheduled in vercel.json. Runs only with CRON_SECRET (like every cron route;
 * refused on previews). The database (migration 0040) decides what is due and
 * refuses anything earlier; this route deletes exactly the files the database
 * marked, records failures, and retries them on the next run. Only stored
 * files are deleted: the document rows stay (marked purged) as the audit
 * record, with no contents.
 */
export const maxDuration = 60;
const BATCH = 200;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const service = createAdminClient();
  const cutoff = retentionCutoff();
  try {
    const report = await runPurge(
      {
        async pending(limit) {
          const { data, error } = await service
            .from("verification_documents")
            .select("id, storage_path")
            .not("purged_at", "is", null)
            .is("purge_confirmed_at", null)
            .limit(limit);
          if (error) throw error;
          return (data ?? []).map((d) => ({ id: d.id, path: d.storage_path }));
        },
        async candidates(limit) {
          const { data: cases, error } = await service
            .from("verification_cases")
            .select("id, status, reviewed_at, updated_at")
            // Decided cases are clocked by reviewed_at (activation and other
            // writes move updated_at); abandoned drafts by updated_at.
            .or(`and(status.in.(approved,rejected),reviewed_at.lte.${cutoff}),and(status.eq.draft,updated_at.lte.${cutoff})`)
            .limit(limit);
          if (error) throw error;
          const due = (cases ?? []).filter((c) => isPurgeable(c, cutoff)).map((c) => c.id);
          if (!due.length) return [];
          const { data: docs, error: docError } = await service
            .from("verification_documents")
            .select("id")
            .in("case_id", due)
            .is("removed_at", null)
            .limit(limit);
          if (docError) throw docError;
          return (docs ?? []).map((d) => d.id);
        },
        async mark(id) {
          const { data, error } = await service.rpc("verification_purge_mark", { p_doc: id });
          if (!error && data) return { path: data };
          const code = /retention:([a-z_]+)/.exec(error?.message ?? "")?.[1];
          if (code === "not_due" || code === "not_found") return { skip: code };
          log.error("verification_retention.mark_failed", { error });
          return { error: "mark_failed" };
        },
        async remove(path) {
          const { error } = await service.storage.from(BUCKET).remove([path]);
          if (!error) return { ok: true };
          log.error("verification_retention.remove_failed", { error });
          return { ok: false, code: "storage_error" };
        },
        async confirm(id) {
          const { error } = await service.rpc("verification_purge_confirm", { p_doc: id });
          if (error) log.error("verification_retention.confirm_failed", { error });
          return !error;
        },
        async failed(id, code) {
          const { error } = await service.rpc("verification_purge_failed", { p_doc: id, p_code: code });
          if (error) log.error("verification_retention.failure_not_recorded", { error });
        },
      },
      BATCH,
    );
    log.info("verification_retention.run", { ...report, days: RETENTION_DAYS });
    return NextResponse.json({ ok: report.failed === 0, days: RETENTION_DAYS, ...report }, { status: report.failed ? 207 : 200 });
  } catch (error) {
    log.error("verification_retention.query_failed", { error });
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}

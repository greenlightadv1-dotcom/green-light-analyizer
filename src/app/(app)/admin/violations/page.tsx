import type { Metadata } from "next";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { banProfile, dismissViolation } from "./actions";

export const metadata: Metadata = { title: "Violations" };

const RULE_LABELS: Record<string, string> = {
  email: "Email address",
  phone: "Phone number",
  social: "External link",
};

/**
 * §6 violation review queue.
 *
 * Everything shown here is post-mask text — the raw contact details were never
 * stored, so reviewing a violation cannot itself leak the PII the filter
 * removed.
 */
export default async function ViolationsPage() {
  await requireRole("admin");

  const supabase = await createClient();
  const { data: logs } = await supabase
    .from("violation_logs")
    .select("*")
    .is("reviewed_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const profileIds = [...new Set((logs ?? []).map((l) => l.profile_id))];
  const { data: profiles } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, role, banned_at")
        .in("id", profileIds)
    : { data: [] };

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  return (
    <>
      <SectionHeader
        title="Violations"
        description="Messages where the masking filter stripped contact details. The text below is already redacted — the originals were never stored."
      />

      {!logs?.length ? (
        <EmptyState
          title="Nothing to review"
          spec="§6"
          body="Attempts to exchange direct contact details or move a deal off-platform appear here for review."
        />
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const who = byId.get(log.profile_id);
            return (
              <GlassPanel key={log.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {who?.full_name ?? "Unknown account"}
                      {who?.banned_at ? (
                        <span className="ml-2 text-xs text-red-300">
                          already banned
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-white/40">
                      {log.created_at
                        ? new Date(log.created_at).toLocaleString()
                        : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {log.matched_rules.map((rule) => (
                      <span
                        key={rule}
                        className="rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-200 uppercase"
                      >
                        {RULE_LABELS[rule] ?? rule}
                      </span>
                    ))}
                  </div>
                </div>

                <p className="mt-3 rounded-xl border border-white/8 bg-navy-dark/60 px-3.5 py-2.5 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-white/70">
                  {log.redacted_excerpt}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {!who?.banned_at ? (
                    <form action={banProfile}>
                      <input
                        type="hidden"
                        name="profile_id"
                        value={log.profile_id}
                      />
                      <input type="hidden" name="log_id" value={log.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/20"
                      >
                        Ban permanently
                      </button>
                    </form>
                  ) : null}

                  <form action={dismissViolation}>
                    <input type="hidden" name="log_id" value={log.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
                    >
                      Dismiss — false positive
                    </button>
                  </form>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      )}
    </>
  );
}

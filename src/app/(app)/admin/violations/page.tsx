import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { banProfile, dismissViolation } from "./actions";
import { ViolationsView, type ViolationItem } from "./ViolationsView";

export const metadata: Metadata = { title: "Violations" };

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

  const items: ViolationItem[] = (logs ?? []).map((log) => {
    const who = byId.get(log.profile_id);
    return {
      id: log.id,
      profileId: log.profile_id,
      createdAt: log.created_at,
      matchedRules: log.matched_rules,
      excerpt: log.redacted_excerpt,
      name: who?.full_name ?? null,
      banned: Boolean(who?.banned_at),
    };
  });

  return <ViolationsView items={items} banAction={banProfile} dismissAction={dismissViolation} />;
}

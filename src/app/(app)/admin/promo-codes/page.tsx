import type { Metadata } from "next";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Promo codes" };

/**
 * Admin promo/trial code history — read-only since the unified Creator Plan.
 *
 * Codes targeted Pro or Elite, which no longer grant anything, so generation
 * and redemption are both refused on the server (actions.ts here and
 * pricing/actions.ts). The rows are kept and listed for the audit trail.
 *
 * promo_codes carries no RLS policy for `authenticated` at all (migration
 * 0013) — a code is a bearer credential, so even this admin-only read goes
 * through the service-role client rather than the caller's own, unlike every
 * other admin page in this app.
 */
export default async function PromoCodesPage() {
  await requireRole("admin");

  const service = createAdminClient();
  const { data: codes } = await service
    .from("promo_codes")
    .select("code, duration_days, target_plan, is_used, expires_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <>
      <SectionHeader
        title="Promo codes"
        description="Retired. Every creator is on the same Creator Plan, so codes are no longer generated or redeemed. Past codes are kept here as history."
      />

      <div>
        <GlassPanel className="overflow-hidden">
          <ul className="divide-y divide-fg/5">
            {(codes ?? []).map((c) => (
              <li
                key={c.code}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5"
              >
                <span className="min-w-0 flex-1 font-mono text-sm text-fg">
                  {c.code}
                </span>
                <span className="text-xs text-fg/60">
                  {c.target_plan} (legacy) · {c.duration_days}d
                </span>
                <span className="text-xs text-fg/40">
                  code valid until{" "}
                  {new Date(c.expires_at).toLocaleDateString()}
                </span>
                {c.is_used ? (
                  <span className="text-xs text-fg/40">Redeemed</span>
                ) : (
                  <span className="text-xs text-brand-green">Unused</span>
                )}
              </li>
            ))}
            {!codes?.length ? (
              <li className="px-5 py-8 text-sm text-fg/40">
                No codes yet.
              </li>
            ) : null}
          </ul>
        </GlassPanel>
      </div>
    </>
  );
}

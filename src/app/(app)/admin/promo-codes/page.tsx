import type { Metadata } from "next";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { GenerateCodeForm } from "./GenerateCodeForm";

export const metadata: Metadata = { title: "Promo codes" };

/**
 * Admin promo/trial code management.
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
        description="Single-use trial codes a creator redeems in Settings to activate Pro or Elite for a fixed number of days."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <GenerateCodeForm />
        </div>

        <GlassPanel className="overflow-hidden lg:col-span-3">
          <ul className="divide-y divide-white/5">
            {(codes ?? []).map((c) => (
              <li
                key={c.code}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5"
              >
                <span className="min-w-0 flex-1 font-mono text-sm text-white">
                  {c.code}
                </span>
                <span className="text-xs text-white/60">
                  {c.target_plan} · {c.duration_days}d
                </span>
                <span className="text-xs text-white/40">
                  code valid until{" "}
                  {new Date(c.expires_at).toLocaleDateString()}
                </span>
                {c.is_used ? (
                  <span className="text-xs text-white/40">Redeemed</span>
                ) : (
                  <span className="text-xs text-brand-green">Unused</span>
                )}
              </li>
            ))}
            {!codes?.length ? (
              <li className="px-5 py-8 text-sm text-white/40">
                No codes yet.
              </li>
            ) : null}
          </ul>
        </GlassPanel>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { VerifiedTag } from "@/components/deals/VerifiedTag";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AnalyzerForm } from "./AnalyzerForm";

export const metadata: Metadata = { title: "Manual analyzer" };

/**
 * Manual Analyzer — CLAUDE.md §5.1. The quick path for an offer that did not
 * arrive through the inbound alias.
 */
export default async function AnalyzerPage() {
  const profile = await requireProfile();

  const supabase = await createClient();
  const { data: kits } = await supabase
    .from("media_kits")
    .select("platform, avg_views, engagement_rate, content_category, audience_verified")
    .eq("creator_id", profile.id)
    .order("avg_views", { ascending: false })
    .limit(1);

  const kit = kits?.[0];
  const audienceVerified = kit?.audience_verified === true;

  return (
    <>
      <SectionHeader
        title="Manual analyzer"
        description="Paste an offer you received anywhere and get an instant price recommendation and risk rating. No email connection required."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <AnalyzerForm />
        </div>

        <div className="space-y-4 lg:col-span-2">
          {/* §7.2: never show audience data without saying which kind it is. */}
          <GlassPanel className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">
                Pricing basis
              </h2>
              <VerifiedTag verified={audienceVerified} />
            </div>

            {kit ? (
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-xs text-white/45">Platform</dt>
                  <dd className="text-white capitalize">{kit.platform}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-xs text-white/45">Average views</dt>
                  <dd className="text-white tabular-nums">
                    {kit.avg_views?.toLocaleString("en-US") ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-xs text-white/45">Engagement</dt>
                  <dd className="text-white tabular-nums">
                    {kit.engagement_rate !== null ? `${kit.engagement_rate}%` : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-xs text-white/45">Category</dt>
                  <dd className="text-white">{kit.content_category ?? "—"}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-white/45">
                No media kit on file yet, so pricing will fall back to the offer
                text alone. Add your reach and audience data in Media kit for a
                usable recommendation.
              </p>
            )}

            {!audienceVerified ? (
              <p className="mt-4 border-t border-white/8 pt-3 text-[11px] leading-relaxed text-white/40">
                Your audience geography is self-reported, so a high-value deal
                can&apos;t be rated green on it alone. Connecting YouTube or
                Instagram analytics lifts that cap.
              </p>
            ) : null}
          </GlassPanel>
        </div>
      </div>
    </>
  );
}

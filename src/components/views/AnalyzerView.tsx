"use client";

import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { VerifiedTag } from "@/components/deals/VerifiedTag";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { AnalyzerForm } from "@/app/(app)/analyzer/AnalyzerForm";
import { useTranslation } from "@/components/LocaleProvider";
import type { MediaKit } from "@/lib/media-kit/queries";

/** Manual Analyzer (§5.1), presentation only. Shared with /preview. */
export function AnalyzerView({
  kit,
  demo = false,
}: {
  kit: Pick<
    MediaKit,
    "platform" | "avg_views" | "engagement_rate" | "content_category" | "audience_verified"
  > | null;
  demo?: boolean;
}) {
  const { t } = useTranslation();
  const audienceVerified = kit?.audience_verified === true;

  return (
    <>
      <SectionHeader
        title={t("analyzer.title")}
        description={t("analyzer.description")}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <AnalyzerForm demo={demo} />
        </div>

        <div className="space-y-4 lg:col-span-2">
          {/* §7.2: never show audience data without saying which kind it is. */}
          <GlassPanel className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-fg">
                {t("analyzer.pricingBasis")}
              </h2>
              <VerifiedTag verified={audienceVerified} />
            </div>

            {kit ? (
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-xs text-fg/45">{t("analyzer.platform")}</dt>
                  <dd className="text-fg capitalize">{kit.platform}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-xs text-fg/45">{t("analyzer.averageViews")}</dt>
                  <dd className="text-fg tabular-nums">
                    {kit.avg_views?.toLocaleString("en-US") ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-xs text-fg/45">{t("analyzer.engagement")}</dt>
                  <dd className="text-fg tabular-nums">
                    {kit.engagement_rate !== null ? `${kit.engagement_rate}%` : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-xs text-fg/45">{t("analyzer.category")}</dt>
                  <dd className="text-fg">{kit.content_category ?? "—"}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-fg/45">
                {t("analyzer.noKitNote")}
              </p>
            )}

            {!audienceVerified ? (
              <p className="mt-4 border-t border-fg/8 pt-3 text-[11px] leading-relaxed text-fg/40">
                {t("analyzer.unverifiedCapNote")}
              </p>
            ) : null}
          </GlassPanel>
        </div>
      </div>
    </>
  );
}

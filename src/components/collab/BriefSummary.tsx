"use client";

import { useTranslation } from "@/components/LocaleProvider";
import { budgetRange, day, PLATFORM_LABEL, TYPE_LABEL_KEY } from "@/lib/collab/display";
import type { Brief } from "@/lib/types/database";

/** The read-only facts of a brief, shown to creators and on a collaboration. */
export function BriefSummary({ brief, compact = false }: { brief: Brief; compact?: boolean }) {
  const { t } = useTranslation();
  const facts: [string, string][] = [];
  if (brief.sponsorship_type) facts.push([t("collab.briefs.fieldType"), t(TYPE_LABEL_KEY[brief.sponsorship_type])]);
  if (brief.platforms.length) facts.push([t("collab.briefs.fieldPlatforms"), brief.platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(", ")]);
  if (brief.target_countries.length) facts.push([t("collab.briefs.fieldCountries"), brief.target_countries.join(", ")]);
  if (brief.categories.length) facts.push([t("collab.briefs.fieldCategories"), brief.categories.map((c) => t(`taxonomy.category.${c}`)).join(", ")]);
  facts.push([t("collab.briefs.budget"), budgetRange(brief.budget_min_usd, brief.budget_max_usd) || t("collab.briefs.noBudget")]);
  if (brief.start_date || brief.due_date) facts.push([t("collab.briefs.dates"), [day(brief.start_date), day(brief.due_date)].filter(Boolean).join(" → ")]);
  return (
    <div className="space-y-3 text-sm">
      {!compact ? <p dir="auto" className="leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] text-fg-secondary">{brief.description}</p> : null}
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-fg-muted">{k}</dt>
            <dd className="text-fg">{v}</dd>
          </div>
        ))}
      </dl>
      {!compact && brief.deliverables_summary ? (
        <div>
          <p className="text-xs text-fg-muted">{t("collab.briefs.fieldSummary")}</p>
          <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere] text-fg">{brief.deliverables_summary}</p>
        </div>
      ) : null}
    </div>
  );
}

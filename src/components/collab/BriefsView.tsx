"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { budgetRange, day } from "@/lib/collab/display";
import type { Brief } from "@/lib/types/database";
import { BriefForm } from "./BriefForm";
import { BTN_PRIMARY, Status } from "./ui";

export type BriefRow = Pick<Brief, "id" | "title" | "status" | "budget_min_usd" | "budget_max_usd" | "due_date" | "updated_at"> & {
  invitations: number;
};

/** A company's own briefs. */
export function BriefsView({ briefs, newHref }: { briefs: BriefRow[]; newHref: string }) {
  const { t } = useTranslation();
  return (
    <>
      <SectionHeader
        title={t("collab.briefs.title")}
        description={t("collab.briefs.description")}
        action={<Link href={newHref} className={BTN_PRIMARY}>{t("collab.briefs.new")}</Link>}
      />
      {briefs.length === 0 ? (
        <EmptyState title={t("collab.briefs.empty")} body={t("collab.briefs.emptyBody")} action={{ href: newHref, label: t("collab.briefs.new") }} />
      ) : (
        <GlassPanel className="overflow-hidden">
          <ul className="divide-y divide-line">
            {briefs.map((b) => (
              <li key={b.id}>
                <Link href={`/briefs/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-surface-hover focus-visible:focus-ring">
                  <div className="min-w-0">
                    <p dir="auto" className="font-medium [overflow-wrap:anywhere] text-fg">{b.title}</p>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {budgetRange(b.budget_min_usd, b.budget_max_usd) || t("collab.briefs.noBudget")}
                      {b.due_date ? ` · ${t("collab.c.due", { date: day(b.due_date) })}` : ""}
                      {` · ${t("collab.briefs.invitations")}: ${b.invitations}`}
                    </p>
                  </div>
                  <Status status={b.status} />
                </Link>
              </li>
            ))}
          </ul>
        </GlassPanel>
      )}
    </>
  );
}

/** The "new brief" screen. */
export function NewBriefView() {
  const { t } = useTranslation();
  return (
    <>
      <Link href="/briefs" className="mb-3 inline-block text-xs text-fg-muted hover:text-fg focus-visible:focus-ring">← {t("collab.briefs.back")}</Link>
      <SectionHeader title={t("collab.briefs.new")} description={t("collab.briefs.description")} />
      <GlassPanel className="max-w-3xl p-5">
        <BriefForm brief={null} />
      </GlassPanel>
    </>
  );
}

"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { day, usd } from "@/lib/collab/display";
import type { Collaboration, Role } from "@/lib/types/database";
import { Status } from "./ui";

/** Every collaboration the caller is a party to (admins: all, read-only). */
export function CollaborationsView({
  role,
  collaborations,
  names,
  briefTitles,
}: {
  role: Role;
  collaborations: Collaboration[];
  names: Record<string, string>;
  briefTitles: Record<string, string>;
}) {
  const { t } = useTranslation();
  const counterpart = (c: Collaboration) =>
    role === "company" ? names[c.creator_id] : role === "creator" ? names[c.company_id] : `${names[c.company_id] ?? "—"} · ${names[c.creator_id] ?? "—"}`;
  return (
    <>
      <SectionHeader title={t("collab.c.title")} description={t("collab.c.description")} />
      {collaborations.length === 0 ? (
        <EmptyState
          title={t("collab.c.empty")}
          body={t(role === "company" ? "collab.c.emptyCompany" : "collab.c.emptyCreator")}
          action={role === "company" ? { href: "/briefs", label: t("collab.briefs.title") } : role === "creator" ? { href: "/opportunities", label: t("collab.opp.title") } : undefined}
        />
      ) : (
        <GlassPanel className="overflow-hidden">
          <ul className="divide-y divide-line">
            {collaborations.map((c) => (
              <li key={c.id}>
                <Link href={`/collaborations/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-surface-hover focus-visible:focus-ring">
                  <div className="min-w-0">
                    <p dir="auto" className="font-medium [overflow-wrap:anywhere] text-fg">{briefTitles[c.brief_id] ?? "—"}</p>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {t("collab.c.with", { name: counterpart(c) ?? "—" })}
                      {c.agreed_amount_usd !== null ? ` · ${usd(c.agreed_amount_usd)}` : ""}
                      {` · ${day(c.updated_at)}`}
                    </p>
                  </div>
                  <Status status={c.status} />
                </Link>
              </li>
            ))}
          </ul>
        </GlassPanel>
      )}
    </>
  );
}

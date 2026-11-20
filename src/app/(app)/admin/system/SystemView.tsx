"use client";

import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Table } from "@/components/ui/Table";
import { useTranslation } from "@/components/LocaleProvider";

export type SystemItem = { name: string; set: boolean; required: boolean; impact: string };

/**
 * Deployment readiness, admin-only. Shows presence only, never a value or a
 * prefix. Variable names are code identifiers and stay as they are (LTR in
 * every language); the "if missing" notes are technical English and are
 * marked lang="en" so screen readers and RTL layout treat them correctly.
 */
export function SystemView({ items, missingRequired }: { items: SystemItem[]; missingRequired: string[] }) {
  const { t } = useTranslation();
  const ready = missingRequired.length === 0;

  return (
    <>
      <SectionHeader title={t("admin.system.title")} description={t("admin.system.description")} />

      <GlassPanel
        className={`mb-4 p-5 ${ready ? "border-success/25 bg-success/5" : "border-warning/30 bg-warning/5"}`}
      >
        <p role="status" className="text-sm font-medium text-fg">
          {ready
            ? t("admin.system.allSet")
            : missingRequired.length === 1
              ? t("admin.system.missingOne")
              : t("admin.system.missingMany", { count: missingRequired.length })}
        </p>
        {!ready ? (
          <p dir="ltr" className="mt-1.5 text-start font-mono text-xs text-warning">
            {missingRequired.join(", ")}
          </p>
        ) : null}
      </GlassPanel>

      <GlassPanel className="overflow-hidden">
        <Table
          caption={t("admin.system.tableCaption")}
          rows={items}
          rowKey={(item) => item.name}
          empty={t("ui.notAvailable")}
          columns={[
            {
              key: "name",
              header: t("admin.system.variable"),
              cell: (item) => (
                <span className="flex flex-wrap items-center gap-2">
                  <span dir="ltr" className="font-mono text-xs text-fg">{item.name}</span>
                  {item.required ? (
                    <span className="text-[10px] font-medium text-fg-muted">{t("admin.system.required")}</span>
                  ) : null}
                </span>
              ),
            },
            {
              key: "status",
              header: t("admin.system.status"),
              className: "whitespace-nowrap",
              cell: (item) =>
                item.set ? (
                  <StatusBadge tone="success">{t("admin.system.set")}</StatusBadge>
                ) : (
                  <StatusBadge tone={item.required ? "danger" : "warning"}>{t("admin.system.notSet")}</StatusBadge>
                ),
            },
            {
              key: "impact",
              header: t("admin.system.ifMissing"),
              className: "text-xs leading-relaxed text-fg-muted",
              cell: (item) =>
                item.set ? (
                  "—"
                ) : (
                  <span lang="en" dir="ltr" className="block text-start">{item.impact}</span>
                ),
            },
          ]}
        />
      </GlassPanel>

      <p className="mt-4 text-xs leading-relaxed text-fg-muted">{t("admin.system.englishNote")}</p>
      <p className="mt-2 text-xs leading-relaxed text-fg-muted">{t("admin.system.footer")}</p>
    </>
  );
}

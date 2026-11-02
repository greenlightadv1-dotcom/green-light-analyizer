"use client";

import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { useTranslation } from "@/components/LocaleProvider";
import type { ActionResult } from "@/lib/ui/action-result";

export type ViolationItem = {
  id: string;
  profileId: string;
  createdAt: string | null;
  matchedRules: string[];
  excerpt: string;
  name: string | null;
  banned: boolean;
};

const RULE_KEYS: Record<string, string> = {
  email: "admin.violations.ruleEmail",
  phone: "admin.violations.rulePhone",
  social: "admin.violations.ruleSocial",
};

/**
 * The violation review queue. Everything shown is post-mask text: the raw
 * contact details were never stored, so reviewing an entry cannot leak them.
 * Ban and dismiss both ask first and report the server's real outcome.
 */
export function ViolationsView({
  items,
  banAction,
  dismissAction,
}: {
  items: ViolationItem[];
  banAction: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  dismissAction: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}) {
  const { t, locale } = useTranslation();

  return (
    <>
      <SectionHeader title={t("admin.violations.title")} description={t("admin.violations.description")} />

      {!items.length ? (
        <EmptyState title={t("admin.violations.emptyTitle")} body={t("admin.violations.emptyBody")} />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const name = item.name ?? t("admin.violations.unknownAccount");
            return (
              <li key={item.id}>
                <GlassPanel className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                        {name}
                        {item.banned ? (
                          <StatusBadge tone="danger">{t("admin.violations.alreadyBanned")}</StatusBadge>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-fg-muted">
                        {item.createdAt ? new Date(item.createdAt).toLocaleString(locale) : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {item.matchedRules.map((rule) => (
                        <StatusBadge key={rule} tone="warning" dot={false}>
                          {RULE_KEYS[rule] ? t(RULE_KEYS[rule]) : rule}
                        </StatusBadge>
                      ))}
                    </div>
                  </div>

                  {/* navy-dark is a fixed dark "code block" surface regardless of
                      theme, so its text stays literal white. */}
                  <p
                    dir="auto"
                    className="mt-3 rounded-control border border-white/8 bg-navy-dark/60 px-3.5 py-2.5 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-white/75"
                  >
                    {item.excerpt}
                  </p>

                  <div className="mt-4 flex flex-wrap items-start gap-2">
                    {!item.banned ? (
                      <ConfirmActionForm
                        action={banAction}
                        hidden={{ profile_id: item.profileId, log_id: item.id }}
                        trigger={{ labelKey: "admin.violations.ban" }}
                        triggerClassName="rounded-chip border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/20 focus-visible:focus-ring"
                        titleKey="admin.violations.banTitle"
                        bodyKey="admin.violations.banBody"
                        confirmKey="admin.violations.banConfirm"
                        successKey="admin.violations.banDone"
                        params={{ name }}
                        tone="danger"
                        className="flex flex-wrap items-center gap-2"
                      />
                    ) : null}
                    <ConfirmActionForm
                      action={dismissAction}
                      hidden={{ log_id: item.id }}
                      trigger={{ labelKey: "admin.violations.dismiss" }}
                      triggerClassName="rounded-chip border border-line bg-surface-muted px-3 py-1.5 text-xs text-fg-secondary transition hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
                      titleKey="admin.violations.dismissTitle"
                      bodyKey="admin.violations.dismissBody"
                      confirmKey="admin.violations.dismissConfirm"
                      successKey="admin.violations.dismissDone"
                      className="flex flex-wrap items-center gap-2"
                    />
                  </div>
                </GlassPanel>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

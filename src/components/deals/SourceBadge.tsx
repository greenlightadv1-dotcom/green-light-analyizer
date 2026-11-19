"use client";

import { useTranslation } from "@/components/LocaleProvider";

/**
 * Dual deal sources (CLAUDE.md §3, §5): a non-null company_id means a
 * registered company sent this directly in-app via Discover
 * (discover/actions.ts); null means it arrived by forwarded email or the
 * Manual Analyzer — no platform account behind the sender address.
 */
export function SourceBadge({ companyId }: { companyId: string | null }) {
  const { t } = useTranslation();
  return companyId ? (
    <span className="rounded-full bg-lime-soft px-2.5 py-0.5 text-xs font-medium text-accent">
      {t("inbox.sourceInApp")}
    </span>
  ) : (
    <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-fg-secondary">
      {t("inbox.sourceForwarded")}
    </span>
  );
}

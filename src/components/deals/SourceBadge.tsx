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
    <span className="rounded-md bg-brand-green/15 px-2 py-0.5 text-xs font-medium text-brand-green">
      {t("inbox.sourceInApp")}
    </span>
  ) : (
    <span className="rounded-md bg-fg/10 px-2 py-0.5 text-xs font-medium text-fg/60">
      {t("inbox.sourceForwarded")}
    </span>
  );
}

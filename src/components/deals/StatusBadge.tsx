"use client";

import { useTranslation } from "@/components/LocaleProvider";
import type { DealStatus } from "@/lib/types/database";

const STYLES: Record<DealStatus, string> = {
  new: "bg-fg/10 text-fg/70",
  negotiating: "bg-sky-400/15 text-sky-700 dark:text-sky-200",
  agreed: "bg-brand-green/15 text-brand-green",
  paid: "bg-brand-green/25 text-brand-green",
  disputed: "bg-red-500/15 text-red-700 dark:text-red-200",
};

const LABEL_KEYS: Record<DealStatus, string> = {
  new: "badges.statusNew",
  negotiating: "badges.statusNegotiating",
  agreed: "badges.statusAgreed",
  paid: "badges.statusPaid",
  disputed: "badges.statusDisputed",
};

export function StatusBadge({ status }: { status: DealStatus | null }) {
  const { t } = useTranslation();
  const s = status ?? "new";
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STYLES[s]}`}>
      {t(LABEL_KEYS[s])}
    </span>
  );
}

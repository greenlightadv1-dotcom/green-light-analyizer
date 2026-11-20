"use client";

import { useTranslation } from "@/components/LocaleProvider";
import type { AiEvaluation } from "@/lib/types/database";

/**
 * The §1 "Deal Co-Pilot" risk rating: green | yellow | red.
 *
 * `capped` marks a rating the §7.4 verification rule downgraded — the engine
 * said green, but the geography behind it is self-reported and the deal is
 * high-value. That distinction is the product's anti-fraud promise made
 * visible, so it is shown rather than quietly applied.
 */
const STYLES: Record<AiEvaluation, string> = {
  green: "border-success/30 bg-success/10 text-success",
  yellow: "border-warning/30 bg-warning/10 text-warning",
  red: "border-danger/30 bg-danger/10 text-danger",
};

const LABEL_KEYS: Record<AiEvaluation, string> = {
  green: "badges.greenLight",
  yellow: "badges.proceedWithCare",
  red: "badges.highRisk",
};

export function RiskBadge({
  risk,
  capped = false,
  className = "",
}: {
  risk: AiEvaluation | null;
  capped?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  if (!risk) {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-fg/10 bg-fg/5 px-2.5 py-0.5 text-xs text-fg-muted ${className}`}
      >
        {t("badges.notEvaluated")}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLES[risk]} ${className}`}
      title={capped ? t("badges.cappedTooltip") : undefined}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {t(LABEL_KEYS[risk])}
      {capped ? <span className="opacity-70">· {t("badges.capped")}</span> : null}
    </span>
  );
}

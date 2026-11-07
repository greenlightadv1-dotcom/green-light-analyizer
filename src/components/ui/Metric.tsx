"use client";

import type { ReactNode } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { ProvenanceBadge } from "@/components/g/ProvenanceBadge";
import type { Provenance } from "@/lib/g/provenance";

/**
 * One figure with where it came from and when. A missing value renders as
 * "Not available", never as 0, so an absent metric can't be read as a real
 * zero. `provenance` reuses G's vocabulary (verified / synced /
 * self-reported / stale / missing) so a number reads the same everywhere.
 */
export function Metric({
  label,
  value,
  provenance,
  asOf,
  hint,
}: {
  label: string;
  value: ReactNode | null | undefined;
  provenance?: Provenance;
  /** ISO timestamp of the last sync, for synced / verified / stale values. */
  asOf?: string | null;
  hint?: string;
}) {
  const { t, locale } = useTranslation();
  const missing = value === null || value === undefined || value === "";
  const when = asOf && Number.isFinite(Date.parse(asOf))
    ? new Date(asOf).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })
    : null;

  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-fg-muted">{label}</dt>
      <dd className="mt-1 flex flex-wrap items-center gap-2">
        <span className={missing ? "text-sm text-fg-subtle" : "text-lg font-semibold text-fg tabular-nums"}>
          {missing ? t("ui.notAvailable") : value}
        </span>
        {provenance ? <ProvenanceBadge provenance={missing ? "missing" : provenance} /> : null}
      </dd>
      {when && !missing ? (
        <p className="mt-0.5 text-xs text-fg-subtle">{t("ui.updatedOn", { date: when })}</p>
      ) : null}
      {hint ? <p className="mt-0.5 text-xs text-fg-muted">{hint}</p> : null}
    </div>
  );
}

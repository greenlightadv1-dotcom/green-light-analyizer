"use client";

import { useTranslation } from "@/components/LocaleProvider";
import type { Provenance } from "@/lib/g/provenance";

const TONE: Record<Provenance, string> = {
  verified: "border-brand-green/30 bg-brand-green/10 text-brand-green",
  synced: "border-sky-400/30 bg-sky-400/10 text-sky-700 dark:text-sky-200",
  self_reported: "border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-200",
  stale: "border-orange-400/30 bg-orange-400/10 text-orange-700 dark:text-orange-200",
  missing: "border-fg/10 bg-fg/5 text-fg/45",
};

/**
 * Where a number came from (lib/g/provenance.ts). Used by G and Discovery so
 * verified, synced, self-reported, stale and missing data always read the
 * same way and are never blended.
 */
export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${TONE[provenance]}`}
    >
      {t(`g.provenance.${provenance}`)}
    </span>
  );
}

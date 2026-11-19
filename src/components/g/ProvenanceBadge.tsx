"use client";

import { useTranslation } from "@/components/LocaleProvider";
import type { Provenance } from "@/lib/g/provenance";

const TONE: Record<Provenance, string> = {
  verified: "border-brand-green/30 bg-brand-green/10 text-accent",
  synced: "border-info/30 bg-info/10 text-info",
  self_reported: "border-warning/30 bg-warning/10 text-warning",
  stale: "border-warning/30 bg-warning/10 text-warning",
  missing: "border-fg/10 bg-fg/5 text-fg-muted",
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

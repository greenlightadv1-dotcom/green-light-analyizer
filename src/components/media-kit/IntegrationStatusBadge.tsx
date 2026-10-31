"use client";

import { useTranslation } from "@/components/LocaleProvider";
import type { IntegrationStatus } from "@/lib/media-kit/platforms";

const TONE: Record<IntegrationStatus, string> = {
  available: "border-brand-green/30 bg-brand-green/10 text-brand-green",
  in_development: "border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-200",
  manual: "border-fg/10 bg-fg/5 text-fg/55",
  planned: "border-fg/10 bg-fg/5 text-fg/45",
};

const LABEL_KEY: Record<IntegrationStatus, string> = {
  available: "integrations.available",
  in_development: "integrations.inDevelopment",
  manual: "integrations.manual",
  planned: "integrations.planned",
};

/**
 * The one label for an integration's status (media-kit/platforms.ts
 * INTEGRATION_STATUS), shared by Pricing, the Media Kit and Settings so each
 * status always reads the same way.
 */
export function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${TONE[status]}`}
    >
      {t(LABEL_KEY[status])}
    </span>
  );
}

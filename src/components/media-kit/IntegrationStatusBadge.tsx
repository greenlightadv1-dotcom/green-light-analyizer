"use client";

import { useTranslation } from "@/components/LocaleProvider";
import type { IntegrationStatus } from "@/lib/media-kit/platforms";

const TONE: Record<IntegrationStatus, string> = {
  available: "border-success/30 bg-success/10 text-success",
  in_development: "border-warning/30 bg-warning/10 text-warning",
  manual: "border-fg/10 bg-fg/5 text-fg-muted",
  planned: "border-fg/10 bg-fg/5 text-fg-muted",
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

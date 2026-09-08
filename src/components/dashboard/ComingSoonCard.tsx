"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";

/**
 * "AI Assistant" teaser — CLAUDE.md §11.
 *
 * Roadmap surface: visible but deliberately NOT clickable. Rendered as a
 * non-interactive element (no button, no link, aria-disabled) so it is
 * genuinely locked rather than styled to look locked.
 */
const FEATURE_KEYS = [
  "dashboard.aiFeature1",
  "dashboard.aiFeature2",
  "dashboard.aiFeature3",
  "dashboard.aiFeature4",
  "dashboard.aiFeature5",
] as const;

export function ComingSoonCard() {
  const { t } = useTranslation();
  return (
    <GlassPanel
      as="section"
      aria-disabled="true"
      className="relative overflow-hidden p-6 opacity-70 select-none"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-fg">{t("dashboard.aiAssistant")}</h2>
        <span className="rounded-full border border-brand-green/30 bg-brand-green/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-brand-green uppercase">
          {t("common.comingSoon")}
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {FEATURE_KEYS.map((key) => (
          <li key={key} className="flex items-start gap-2 text-sm text-fg/45">
            <span
              aria-hidden
              className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg/25"
            />
            {t(key)}
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
}

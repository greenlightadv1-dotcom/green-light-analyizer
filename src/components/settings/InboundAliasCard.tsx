"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";

/**
 * Email intake setup — CLAUDE.md §5.1–§5.2.
 *
 * The on-ramp to the whole pipeline: no forwarding rule, no offers, no deal
 * rooms. Worth being explicit that this is a one-time Gmail setting the creator
 * makes themselves — the app never connects to Gmail, never asks for Google
 * OAuth, and never touches the Gmail API. That is a deliberate design choice
 * (§5), not a limitation, and saying so heads off the obvious "why can't it
 * just link my inbox?" question.
 *
 * The full 5-step guide is collapsed behind a native <details> accordion —
 * closed by default — so the card reads as "here's your address, copy it"
 * first, with the walkthrough one click away rather than always on screen.
 */

const STEP_KEYS = [
  "settings.step1",
  "settings.step2",
  "settings.step3",
  "settings.step4",
  "settings.step5",
] as const;

export function InboundAliasCard({ alias }: { alias: string | null }) {
  const { t } = useTranslation();

  return (
    <GlassPanel className="p-6">
      <h2 className="text-sm font-semibold text-fg">{t("settings.emailIntake")}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-fg/50">
        {t("settings.emailIntakeNote")}
      </p>

      {alias ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 rounded-xl border border-fg/10 bg-navy-dark/70 px-3.5 py-2.5 font-mono text-sm break-all text-brand-green">
            {alias}
          </code>
          <CopyButton value={alias} />
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-700 dark:text-amber-100">
          {t("settings.noAliasNote")}
        </p>
      )}

      <details className="mt-5 group">
        <summary className="cursor-pointer list-none text-xs font-medium text-fg/60 transition hover:text-fg [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block transition-transform group-open:rotate-90">›</span>
            {t("settings.showSetupGuide")}
          </span>
        </summary>
        <ol className="mt-3 space-y-2.5">
          {STEP_KEYS.map((key, i) => (
            <li key={key} className="flex gap-3 text-xs leading-relaxed text-fg/55">
              <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-fg/8 text-[10px] font-medium text-fg/60">
                {i + 1}
              </span>
              {t(key)}
            </li>
          ))}
        </ol>
      </details>

      <p className="mt-5 border-t border-fg/8 pt-4 text-[11px] leading-relaxed text-fg/35">
        {t("settings.privacyFooter")}
      </p>
    </GlassPanel>
  );
}

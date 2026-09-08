"use client";

import { useState } from "react";
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
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!alias) return;
    try {
      await navigator.clipboard.writeText(alias);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some browsers and every insecure origin. The
      // address is on screen and selectable, so this is not worth an error.
    }
  }

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
          <button
            type="button"
            onClick={copy}
            className="rounded-xl border border-fg/10 bg-fg/5 px-3.5 py-2.5 text-xs text-fg/70 transition hover:bg-fg/10 hover:text-fg"
          >
            {copied ? t("common.copied") : t("common.copy")}
          </button>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-700 dark:text-amber-100">
          {t("settings.noAliasNote")}
        </p>
      )}

      <ol className="mt-5 space-y-2.5">
        {STEP_KEYS.map((key, i) => (
          <li key={key} className="flex gap-3 text-xs leading-relaxed text-fg/55">
            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-fg/8 text-[10px] font-medium text-fg/60">
              {i + 1}
            </span>
            {t(key)}
          </li>
        ))}
      </ol>

      <p className="mt-5 border-t border-fg/8 pt-4 text-[11px] leading-relaxed text-fg/35">
        {t("settings.privacyFooter")}
      </p>
    </GlassPanel>
  );
}

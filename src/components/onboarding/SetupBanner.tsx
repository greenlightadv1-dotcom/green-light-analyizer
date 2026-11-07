"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";

/** Dashboard nudge to /onboarding while required steps remain (feature 2). */
export function SetupBanner({ done, total, gatedNote = false }: { done: number; total: number; gatedNote?: boolean }) {
  const { t } = useTranslation();
  return (
    <Link
      href="/onboarding"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-green/25 bg-brand-green/8 px-5 py-4 transition hover:bg-brand-green/12"
    >
      <div>
        <p className="text-sm font-semibold text-fg">{t("onboarding.title")}</p>
        <p className="mt-0.5 text-xs text-fg/60">
          {t("onboarding.progress", { done: String(done), total: String(total) })}
          {gatedNote ? ` · ${t("onboarding.offersGated")}` : ""}
        </p>
      </div>
      <span className="text-sm font-semibold text-brand-green">→</span>
    </Link>
  );
}

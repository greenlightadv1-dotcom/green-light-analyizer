"use client";

import { useTranslation } from "@/components/LocaleProvider";

/**
 * Media Kit PDF v1: the browser's own print dialog ("Save as PDF"), so no
 * server-side PDF service is involved and nothing leaves the page that the
 * visitor can't already see. Hidden from the printout itself.
 */
export function PrintButton() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-1 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-10 items-center rounded-control border border-line bg-surface-muted px-4 text-sm text-fg transition hover:bg-surface-hover focus-visible:focus-ring"
      >
        {t("printing.button")}
      </button>
      <p className="text-[11px] text-fg-muted">{t("printing.hint")}</p>
    </div>
  );
}

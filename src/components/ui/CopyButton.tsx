"use client";

import { useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";

/** One-click copy-to-clipboard button with "Copied" feedback. */
export function CopyButton({ value, className = "" }: { value: string; className?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some browsers and every insecure origin. The
      // value is on screen and selectable, so this is not worth an error.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`rounded-xl border border-fg/10 bg-fg/5 px-3.5 py-2.5 text-xs text-fg/70 transition hover:bg-fg/10 hover:text-fg ${className}`}
    >
      {copied ? t("common.copied") : t("common.copy")}
    </button>
  );
}

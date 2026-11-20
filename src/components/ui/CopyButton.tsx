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
      className={`inline-flex h-9 items-center rounded-full border border-line-strong bg-surface px-4 text-xs font-semibold text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg focus-visible:focus-ring ${className}`}
    >
      {copied ? t("common.copied") : t("common.copy")}
    </button>
  );
}

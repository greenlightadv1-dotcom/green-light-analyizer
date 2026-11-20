"use client";

import { useTranslation } from "@/components/LocaleProvider";

/** A translated string inside a server component (the dictionary lives in the client provider). */
export function T({ k, vars }: { k: string; vars?: Record<string, string | number> }) {
  const { t } = useTranslation();
  return <>{t(k, vars)}</>;
}

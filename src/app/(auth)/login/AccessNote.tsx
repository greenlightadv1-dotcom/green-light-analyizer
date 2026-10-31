"use client";

import { useTranslation } from "@/components/LocaleProvider";

/**
 * The sign-in page's access note. §4.1: there is no self-signup, so it points
 * to support instead of a "create account" link. There is one Creator Plan,
 * so it no longer offers a "plan change".
 */
export function AccessNote() {
  const { t } = useTranslation();
  return (
    <p className="mt-7 border-t border-fg/8 pt-5 text-xs leading-relaxed text-fg/45">
      {t("login.accessNote")}
    </p>
  );
}

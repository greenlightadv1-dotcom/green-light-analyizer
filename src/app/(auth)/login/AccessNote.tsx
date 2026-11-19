"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";

/**
 * The sign-in page's access note. §4.1: there is no self-signup, so it points
 * to support instead of a "create account" link. There is one Creator Plan,
 * so it no longer offers a "plan change".
 */
export function AccessNote() {
  const { t } = useTranslation();
  return (
    <div className="mt-7 space-y-2 border-t border-fg/8 pt-5 text-xs leading-relaxed text-fg-muted">
      <p>{t("login.accessNote")}</p>
      {/* Applicants have no account until approval: their status is read through an emailed link. */}
      <p><Link href="/apply" className="text-accent underline">{t("login.applicationStatus")}</Link></p>
    </div>
  );
}

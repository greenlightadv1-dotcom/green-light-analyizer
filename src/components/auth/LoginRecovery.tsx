"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";

/** The sign-in page's localized recovery entry point and post-reset notice. */
export function ForgotPasswordLink() {
  const { t } = useTranslation();
  return (
    <p className="mt-3 text-end text-sm">
      <Link href="/forgot-password" className="text-brand-green underline underline-offset-2">{t("passwordReset.forgotLink")}</Link>
    </p>
  );
}

export function ResetDoneNotice() {
  const { t } = useTranslation();
  return (
    <p role="status" data-testid="reset-done" className="mt-4 rounded-lg border border-brand-green/30 bg-brand-green/10 px-3 py-2 text-sm text-fg">
      {t("passwordReset.done")}
    </p>
  );
}

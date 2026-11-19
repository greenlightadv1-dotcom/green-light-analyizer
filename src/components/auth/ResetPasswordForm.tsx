"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { GlassPanel } from "@/components/ui/GlassPanel";
import type { ResetState } from "@/app/(auth)/reset-password/actions";

const INPUT = "mt-1 h-10 w-full rounded-control border border-line bg-surface-muted px-3 text-sm text-fg";

export function ResetPasswordForm({ state, email, action }: { state: "ready" | "signed_in" | "missing"; email: string | null; action: (p: ResetState, fd: FormData) => Promise<ResetState> }) {
  const { t } = useTranslation();
  const [result, formAction, pending] = useActionState<ResetState, FormData>(action, { errorKey: null });
  return (
    <GlassPanel className="space-y-4 p-7 sm:p-8">
      <h1 className="text-2xl font-bold text-fg sm:text-3xl">{t("passwordReset.resetTitle")}</h1>
      {state === "missing" ? (
        <div data-testid="reset-missing" className="space-y-3">
          <p className="text-sm text-fg-secondary">{t("passwordReset.missing")}</p>
          <Link href="/forgot-password" className="inline-flex h-10 items-center rounded-control bg-brand-green px-4 text-sm font-semibold text-ink">{t("passwordReset.requestNew")}</Link>
        </div>
      ) : state === "signed_in" ? (
        <div data-testid="reset-signed-in" className="space-y-3">
          <p className="text-sm text-fg-secondary">{t("passwordReset.signedIn")}</p>
          <Link href="/settings" className="text-sm text-accent underline underline-offset-2">{t("passwordReset.toSettings")}</Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-fg-secondary">{t("passwordReset.resetIntro")}</p>
          {email ? <p className="text-sm text-fg"><span className="text-fg-muted">{t("passwordReset.account")}: </span><span dir="ltr" data-testid="reset-email">{email}</span></p> : null}
          <form action={formAction} className="space-y-3">
            <label className="block text-xs font-medium text-fg-secondary">
              {t("passwordReset.newPassword")}
              <input name="password" type="password" required minLength={10} maxLength={72} autoComplete="new-password" className={INPUT} />
            </label>
            <p className="text-xs text-fg-muted">{t("activation.passwordRules")}</p>
            <label className="block text-xs font-medium text-fg-secondary">
              {t("passwordReset.confirm")}
              <input name="confirm" type="password" required minLength={10} maxLength={72} autoComplete="new-password" className={INPUT} />
            </label>
            {result.errorKey ? (
              <div role="alert" className="text-sm text-danger">
                <p>{t(result.errorKey)}</p>
                {result.problems?.length ? <ul className="mt-1 list-disc ps-5 text-xs">{result.problems.map((p) => <li key={p}>{t(`activation.problem.${p}`)}</li>)}</ul> : null}
              </div>
            ) : null}
            <button type="submit" disabled={pending} className="inline-flex h-10 items-center justify-center rounded-control bg-brand-green px-4 text-sm font-semibold text-ink disabled:opacity-50">
              {pending ? t("passwordReset.saving") : t("passwordReset.save")}
            </button>
          </form>
        </>
      )}
    </GlassPanel>
  );
}

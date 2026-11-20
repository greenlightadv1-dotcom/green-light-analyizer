"use client";

import { useActionState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { GlassPanel } from "@/components/ui/GlassPanel";
import type { ActivateState } from "@/app/activate/actions";

const INPUT = "mt-1 h-10 w-full rounded-control border border-line bg-surface-muted px-3 text-sm text-fg";

/** Choose a password and create the account from a one-time activation link. */
export function ActivateForm({
  token,
  email,
  action,
}: {
  token: string;
  email: string | null;
  action: (prev: ActivateState, fd: FormData) => Promise<ActivateState>;
}) {
  const { t } = useTranslation();
  const [state, formAction, pending] = useActionState<ActivateState, FormData>(action, { errorKey: null });
  return (
    <GlassPanel className="space-y-4 p-6">
      <p className="text-sm text-fg-secondary">{t("activation.intro")}</p>
      {email ? <p className="text-sm text-fg"><span className="text-fg-muted">{t("apply.email")}: </span><span dir="ltr">{email}</span></p> : null}
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="token" value={token} />
        <label className="block text-xs font-medium text-fg-secondary">
          {t("activation.password")}
          <input name="password" type="password" required minLength={10} maxLength={72} autoComplete="new-password" className={INPUT} />
        </label>
        <p className="text-xs text-fg-muted">{t("activation.passwordRules")}</p>
        <label className="block text-xs font-medium text-fg-secondary">
          {t("activation.confirm")}
          <input name="confirm" type="password" required minLength={10} maxLength={72} autoComplete="new-password" className={INPUT} />
        </label>
        <label className="flex items-start gap-2 text-sm text-fg">
          <input type="checkbox" name="terms" required className="mt-1" />
          <span>{t("activation.terms")}</span>
        </label>
        {state.errorKey ? (
          <div role="alert" className="text-sm text-danger">
            <p>{t(state.errorKey)}</p>
            {state.problems?.length ? <ul className="mt-1 list-disc ps-5 text-xs">{state.problems.map((p) => <li key={p}>{t(`activation.problem.${p}`)}</li>)}</ul> : null}
          </div>
        ) : null}
        <button type="submit" disabled={pending} className="inline-flex h-10 items-center justify-center rounded-control bg-brand-green px-4 text-sm font-semibold text-ink disabled:opacity-50">
          {pending ? t("activation.creating") : t("activation.create")}
        </button>
      </form>
    </GlassPanel>
  );
}

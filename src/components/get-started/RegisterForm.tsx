"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { registerAccount, type RegisterState } from "@/app/register/actions";
import { REGISTER_JOURNEYS, type RegisterJourney } from "@/lib/registration";

const INPUT = "mt-1 h-11 w-full rounded-control border border-line bg-surface-muted px-3 text-sm text-fg focus:border-brand-green/50 focus:outline-none";

/** Self-registration form. When disabled it explains and points to the application form. */
export function RegisterForm({ enabled, initialJourney }: { enabled: boolean; initialJourney: RegisterJourney }) {
  const { t } = useTranslation();
  const [journey, setJourney] = useState<RegisterJourney>(initialJourney);
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAccount, { status: "idle" });

  if (!enabled) {
    return (
      <section className="mx-auto max-w-xl px-4 pt-16 pb-20">
        <div className="glass-panel space-y-4 p-6">
          <h1 className="text-2xl font-bold text-fg">{t("register.title")}</h1>
          <p className="text-sm text-fg-secondary">{t("register.disabled")}</p>
          <Link href={`/get-started/${journey}`} className="inline-flex h-11 items-center rounded-control bg-brand-green px-5 text-sm font-semibold text-ink focus-visible:focus-ring">{t("register.applyInstead")}</Link>
        </div>
      </section>
    );
  }

  if (state.status === "check_email") {
    return (
      <section className="mx-auto max-w-xl px-4 pt-16 pb-20">
        <div role="status" className="glass-panel p-6 text-sm text-fg">{t("register.checkEmail")}</div>
      </section>
    );
  }

  const fieldError = state.status === "invalid" ? state.field : null;
  return (
    <section className="mx-auto max-w-xl px-4 pt-16 pb-20">
      <form action={action} className="glass-panel space-y-4 p-6" noValidate={false}>
        <h1 className="text-2xl font-bold text-fg">{t("register.title")}</h1>
        <p className="text-sm text-fg-secondary">{t("register.intro")}</p>
        <fieldset className="grid gap-2 sm:grid-cols-3">
          <legend className="sr-only">{t("register.errors.journey")}</legend>
          {REGISTER_JOURNEYS.map((j) => (
            <label key={j} className={`cursor-pointer rounded-control border px-3 py-2 text-sm ${journey === j ? "border-brand-green bg-brand-green/10 text-fg" : "border-line text-fg-secondary"}`}>
              <input type="radio" name="journey" value={j} checked={journey === j} onChange={() => setJourney(j)} className="sr-only" />
              {t(`getStarted.journey.${j}.title`)}
            </label>
          ))}
        </fieldset>
        <label className="block text-xs font-medium text-fg-secondary">{t("register.fullName")}
          <input name="full_name" required minLength={2} maxLength={120} autoComplete="name" className={INPUT} aria-invalid={fieldError === "full_name"} />
        </label>
        <label className="block text-xs font-medium text-fg-secondary">{t("register.email")}
          <input name="email" type="email" required autoComplete="email" dir="ltr" className={INPUT} aria-invalid={fieldError === "email"} />
        </label>
        <label className="block text-xs font-medium text-fg-secondary">{t("register.password")}
          <input name="password" type="password" required minLength={10} maxLength={72} autoComplete="new-password" dir="ltr" className={INPUT} aria-describedby="pw-hint" aria-invalid={fieldError === "password"} />
          <span id="pw-hint" className="mt-1 block font-normal text-fg-muted">{t("register.passwordHint")}</span>
        </label>
        <label className="flex items-start gap-2 text-sm text-fg">
          <input type="checkbox" name="terms" required className="mt-1" />
          <span>
            {t("register.terms")} <Link href="/terms" className="underline" target="_blank">{t("register.termsLink")}</Link> · <Link href="/privacy" className="underline" target="_blank">{t("register.privacyLink")}</Link>
          </span>
        </label>
        {fieldError ? <p role="alert" className="text-sm text-danger">{t(`register.errors.${fieldError}`)}</p> : null}
        {state.status === "error" ? <p role="alert" className="text-sm text-danger">{t(`register.errors.${state.code}`)}</p> : null}
        <button type="submit" disabled={pending} className="inline-flex h-11 w-full items-center justify-center rounded-control bg-brand-green text-sm font-semibold text-ink hover:brightness-110 focus-visible:focus-ring disabled:opacity-50">
          {pending ? t("register.submitting") : t("register.submit")}
        </button>
        <p className="text-center text-xs text-fg-muted"><Link href="/login" className="underline">{t("register.haveAccount")}</Link></p>
      </form>
    </section>
  );
}

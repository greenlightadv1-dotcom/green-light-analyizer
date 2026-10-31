"use client";

import { useActionState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { saveCompanyDetails, type SaveState } from "@/app/(app)/onboarding/actions";

export type CompanyInitial = {
  full_name: string;
  bio: string | null;
  company_website: string | null;
  company_industry: string | null;
};

/** Company details (feature 2). Prefilled from the account; validated again on the server. */
export function CompanyDetailsForm({ initial, demo = false }: { initial: CompanyInitial; demo?: boolean }) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState<SaveState, FormData>(saveCompanyDetails, { error: null, saved: false });
  // On a refused save, keep what was typed (React resets the form after the action).
  const v = state.values ?? null;

  return (
    <form action={action} className="space-y-4" key={v ? JSON.stringify(v) : "initial"}>
      <Field id="full_name" name="full_name" label={t("onboarding.companyName")} defaultValue={v?.full_name ?? initial.full_name} required minLength={2} maxLength={120} />
      <Field id="company_industry" name="company_industry" label={t("onboarding.industry")} defaultValue={v?.company_industry ?? initial.company_industry ?? ""} required maxLength={60} />
      <Field
        id="company_website"
        name="company_website"
        label={t("onboarding.website")}
        hint={t("onboarding.websiteHint")}
        defaultValue={v?.company_website ?? initial.company_website ?? ""}
        maxLength={200}
        inputMode="url"
        dir="ltr"
      />
      <div className="space-y-1.5">
        <label htmlFor="bio" className="block text-xs font-medium tracking-wide text-fg/70 uppercase">
          {t("onboarding.description")}
        </label>
        <textarea
          id="bio"
          name="bio"
          required
          maxLength={600}
          rows={4}
          defaultValue={v?.bio ?? initial.bio ?? ""}
          aria-describedby="bio-hint"
          className="w-full rounded-xl border border-fg/10 bg-fg/5 px-3.5 py-2.5 text-sm text-fg placeholder:text-fg/30 focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none"
        />
        <p id="bio-hint" className="text-xs text-fg/45">
          {t("onboarding.descriptionHint")}
        </p>
      </div>
      {state.error ? <Alert tone={state.saved ? "info" : "error"}>{t(`onboarding.error.${state.error}`)}</Alert> : null}
      {state.saved && !state.error ? <Alert tone="info">{t("onboarding.saved")}</Alert> : null}
      <Button type="submit" fullWidth={false} disabled={pending || demo}>
        {pending ? t("onboarding.saving") : t("onboarding.save")}
      </Button>
    </form>
  );
}

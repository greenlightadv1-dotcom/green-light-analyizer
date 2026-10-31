"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { submitAccessRequest, type ApplyState } from "@/app/get-started/actions";
import { HONEYPOT_FIELD, type Journey } from "@/lib/access-requests";

const PLATFORMS = ["youtube", "twitch", "kick", "instagram", "tiktok", "x", "other"] as const;

/**
 * One application per journey (features 1–2). Client checks mirror the
 * server's (lib/access-requests.ts), which stays authoritative; on an error
 * the form keeps what was typed (inputs are uncontrolled with defaultValue
 * from the submitted data).
 */
export function ApplicationForm({ journey }: { journey: Journey }) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState<ApplyState, FormData>(submitAccessRequest, { status: "idle" });
  const errors = state.status === "invalid" ? state.errors : {};
  const err = (k: keyof typeof errors) => (errors[k] ? t(`getStarted.fieldError.${errors[k]}`) : undefined);
  // React resets a form after its action runs; the server echoes what was
  // typed so a failed submit never makes the applicant start again.
  const v = state.status === "invalid" || state.status === "error" ? state.values : null;

  if (state.status === "submitted") {
    return (
      <div className="glass-panel p-6 text-center sm:p-8" role="status">
        <h2 className="text-lg font-semibold text-fg">{t("getStarted.submittedTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/60">{t("getStarted.submittedBody")}</p>
        <Link href="/" className="mt-5 inline-block text-sm font-medium text-brand-green underline-offset-2 hover:underline">
          {t("getStarted.backHome")}
        </Link>
      </div>
    );
  }

  const company = journey !== "creator";

  return (
    <form action={action} className="glass-panel space-y-4 p-6 sm:p-8" key={state.status === "idle" ? "idle" : JSON.stringify(v)}>
      <input type="hidden" name="journey" value={journey} />
      {/* Honeypot: hidden from people and assistive tech. */}
      <div aria-hidden className="absolute -start-[10000px] h-px w-px overflow-hidden">
        <label>
          Fax
          <input name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Field id="full_name" name="full_name" defaultValue={v?.full_name} label={t("getStarted.fullName")} required minLength={2} maxLength={120} autoComplete="name" hint={err("full_name")} aria-invalid={!!errors.full_name} />
      <Field id="email" name="email" defaultValue={v?.email} type="email" label={t(company ? "getStarted.workEmail" : "getStarted.email")} required maxLength={254} autoComplete="email" dir="ltr" hint={err("email")} aria-invalid={!!errors.email} />

      {company ? (
        <>
          <Field
            id="company_name"
            name="company_name"
            defaultValue={v?.company_name}
            label={t(journey === "company_representative" ? "getStarted.representedCompany" : "getStarted.companyName")}
            required
            maxLength={120}
            autoComplete="organization"
            hint={err("company_name")}
            aria-invalid={!!errors.company_name}
          />
          <Field id="website" name="website" defaultValue={v?.website} label={t("getStarted.website")} maxLength={200} inputMode="url" dir="ltr" hint={err("website") ?? t("getStarted.optional")} aria-invalid={!!errors.website} />
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <label htmlFor="primary_platform" className="block text-xs font-medium tracking-wide text-fg/70 uppercase">
              {t("getStarted.primaryPlatform")}
            </label>
            <select
              id="primary_platform"
              name="primary_platform"
              required
              defaultValue={v?.primary_platform ?? ""}
              aria-invalid={!!errors.primary_platform}
              className="h-11 w-full rounded-xl border border-fg/10 bg-fg/5 px-3 text-sm text-fg focus:border-brand-green/50 focus:outline-none"
            >
              <option value="" disabled className="bg-slate-900 text-white">
                {t("getStarted.choosePlatform")}
              </option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p} className="bg-slate-900 text-white">
                  {t(`getStarted.platform.${p}`)}
                </option>
              ))}
            </select>
            {errors.primary_platform ? <p className="text-xs text-red-600 dark:text-red-300">{err("primary_platform")}</p> : null}
          </div>
          <Field id="channel_handle" name="channel_handle" defaultValue={v?.channel_handle} label={t("getStarted.channelHandle")} maxLength={120} dir="ltr" hint={err("channel_handle") ?? t("getStarted.optional")} />
        </>
      )}

      <div className="space-y-1.5">
        <label htmlFor="message" className="block text-xs font-medium tracking-wide text-fg/70 uppercase">
          {t("getStarted.message")}
        </label>
        <textarea
          id="message"
          name="message"
          defaultValue={v?.message}
          rows={3}
          maxLength={1000}
          className="w-full rounded-xl border border-fg/10 bg-fg/5 px-3.5 py-2.5 text-sm text-fg focus:border-brand-green/50 focus:outline-none"
        />
        <p className="text-xs text-fg/45">{err("message") ?? t("getStarted.optional")}</p>
      </div>

      {state.status === "error" ? <Alert>{t(`getStarted.error.${state.code}`)}</Alert> : null}
      {state.status === "invalid" ? <Alert>{t("getStarted.error.invalid")}</Alert> : null}

      <p className="text-xs leading-relaxed text-fg/50">
        {t("getStarted.consentPrefix")}{" "}
        <Link href="/terms" className="underline">
          {t("getStarted.terms")}
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="underline">
          {t("getStarted.privacy")}
        </Link>
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? t("getStarted.submitting") : t("getStarted.submit")}
      </Button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import { createUser, type CreateUserState } from "./actions";

const selectClass =
  "h-11 w-full rounded-xl border border-fg/10 bg-fg/5 px-3.5 text-sm text-fg transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none";

function SubmitButton() {
  const { pending } = useFormStatus();
  const { t } = useTranslation();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? t("admin.createUser.submitting") : t("admin.createUser.submit")}
    </Button>
  );
}

export type CreateUserPrefill = {
  requestId: string;
  full_name: string;
  email: string;
  role: "creator" | "company";
  note: string;
};

export function CreateUserForm({ prefill }: { prefill?: CreateUserPrefill | null }) {
  const [state, formAction] = useActionState<CreateUserState, FormData>(
    createUser,
    { error: null, created: null },
  );
  const { t } = useTranslation();

  return (
    <GlassPanel className="p-6">
      <h2 className="text-sm font-semibold text-fg">{t("admin.createUser.title")}</h2>
      <p className="mt-1 text-xs leading-relaxed text-fg-muted">{t("admin.createUser.body")}</p>

      {prefill ? (
        <p className="mt-3 rounded-chip border border-success/25 bg-success/10 px-3 py-2 text-xs text-fg-secondary">
          {t("admin.createUser.fromApplication", { note: prefill.note })}
        </p>
      ) : null}

      <form action={formAction} className="mt-5 space-y-4" key={prefill?.requestId ?? "blank"}>
        {prefill ? <input type="hidden" name="request_id" value={prefill.requestId} /> : null}
        <Field
          id="full_name"
          name="full_name"
          label={t("admin.createUser.fullName")}
          autoComplete="off"
          required
          defaultValue={prefill?.full_name}
        />
        <Field
          id="email"
          name="email"
          type="email"
          label={t("admin.createUser.email")}
          autoComplete="off"
          required
          defaultValue={prefill?.email}
        />

        <div className="space-y-1.5">
          <label
            htmlFor="role"
            className="block text-xs font-medium tracking-wide text-fg/70 uppercase"
          >
            {t("admin.createUser.role")}
          </label>
          <select id="role" name="role" className={selectClass} required defaultValue={prefill?.role ?? "creator"}>
            <option value="creator">{t("admin.createUser.roleCreator")}</option>
            <option value="company">{t("admin.createUser.roleCompany")}</option>
            <option value="admin">{t("admin.createUser.roleAdmin")}</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="region"
            className="block text-xs font-medium tracking-wide text-fg/70 uppercase"
          >
            {t("admin.createUser.region")}
          </label>
          {/*
            §13 open question: region is set by the admin here rather than
            auto-detected, because it drives which price list the user sees.
          */}
          <select id="region" name="region" className={selectClass} required>
            <option value="MENA">{t("admin.createUser.regionMena")}</option>
            <option value="International">{t("admin.createUser.regionInternational")}</option>
          </select>
        </div>

        {state.error ? <Alert>{state.error}</Alert> : null}

        {state.created ? (
          <div role="status" className="rounded-control border border-success/25 bg-success/10 p-3.5">
            <p className="text-sm text-success">
              {t("admin.createUser.created", { email: state.created.email })}
            </p>
            <p className="mt-2 text-xs text-fg-secondary">{t("admin.createUser.tempPasswordNote")}</p>
            {/* navy-dark is a fixed dark "code block" surface (§2.1) regardless
                of theme, so its text stays literal white, not the fg token. */}
            <code dir="ltr" className="mt-1.5 block rounded-chip bg-navy-dark/80 px-3 py-2 font-mono text-sm break-all text-white">
              {state.created.tempPassword}
            </code>
          </div>
        ) : null}

        <SubmitButton />
      </form>
    </GlassPanel>
  );
}

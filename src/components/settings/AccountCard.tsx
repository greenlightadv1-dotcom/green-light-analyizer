"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import {
  updateDisplayName,
  changePassword,
  type UpdateDisplayNameState,
  type ChangePasswordState,
} from "@/app/(app)/settings/actions";
import type { Profile } from "@/lib/auth";

function SaveButton({ label, demo }: { label: string; demo: boolean }) {
  const { pending } = useFormStatus();
  const { t } = useTranslation();
  return (
    <Button
      type={demo ? "button" : "submit"}
      disabled={pending}
      fullWidth={false}
      className="px-5"
    >
      {pending ? t("common.saving") : label}
    </Button>
  );
}

/**
 * Settings -> Account. Email is deliberately plain text, never an input —
 * it's the identity Supabase Auth and every RLS policy key off, so there is
 * no edit path for it at all (not even a disabled one, which would invite a
 * "why can't I submit this?" bug report). Display name and password are the
 * two things a creator/company genuinely owns here.
 */
export function AccountCard({ profile, demo = false }: { profile: Profile; demo?: boolean }) {
  const { t } = useTranslation();
  const [nameState, nameAction] = useActionState<UpdateDisplayNameState, FormData>(
    updateDisplayName,
    { error: null, saved: false },
  );
  const [passwordState, passwordAction] = useActionState<ChangePasswordState, FormData>(
    changePassword,
    { error: null, saved: false },
  );

  return (
    <GlassPanel className="p-6">
      <h2 className="text-sm font-semibold text-fg">{t("settings.account")}</h2>

      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-xs text-fg/45">{t("settings.email")}</dt>
          {/*
            Safe here: this is the creator/company viewing their OWN profile.
            This value must never be rendered in a company's view of another
            party's product (§6, §12) — enforced by RLS, not by remembering
            not to. Read-only by design — see the doc comment above.
          */}
          <dd className="text-fg">{profile.primary_email}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg/45">{t("settings.role")}</dt>
          <dd className="text-fg capitalize">{profile.role}</dd>
        </div>
      </dl>

      <form action={demo ? undefined : nameAction} className="mt-5 space-y-3 border-t border-fg/8 pt-4">
        <Field
          id="full_name"
          name="full_name"
          label={t("settings.name")}
          defaultValue={profile.full_name}
          maxLength={200}
          required
        />
        {nameState.error ? <Alert>{nameState.error}</Alert> : null}
        {nameState.saved ? <Alert tone="info">{t("common.saved")}</Alert> : null}
        <SaveButton label={t("settings.saveName")} demo={demo} />
      </form>

      <form action={demo ? undefined : passwordAction} className="mt-5 space-y-3 border-t border-fg/8 pt-4">
        <h3 className="text-xs font-medium tracking-wide text-fg/70 uppercase">
          {t("settings.changePassword")}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            label={t("settings.newPassword")}
            minLength={10}
            required
          />
          <Field
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            label={t("settings.confirmPassword")}
            minLength={10}
            required
          />
        </div>
        <p className="text-xs text-fg/45">{t("settings.passwordHint")}</p>
        {passwordState.error ? <Alert>{passwordState.error}</Alert> : null}
        {passwordState.saved ? <Alert tone="info">{t("settings.passwordUpdated")}</Alert> : null}
        <SaveButton label={t("settings.savePassword")} demo={demo} />
      </form>
    </GlassPanel>
  );
}

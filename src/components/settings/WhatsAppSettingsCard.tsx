"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import {
  updateWhatsAppSettings,
  type UpdateWhatsAppState,
} from "@/app/(app)/settings/actions";
import type { Profile } from "@/lib/auth";

function SaveButton({ demo }: { demo: boolean }) {
  const { pending } = useFormStatus();
  const { t } = useTranslation();
  return (
    <Button
      type={demo ? "button" : "submit"}
      disabled={pending}
      fullWidth={false}
      className="px-5"
    >
      {pending ? t("common.saving") : t("common.save")}
    </Button>
  );
}

/**
 * Settings -> WhatsApp notifications. Fires through notifyNewDeal()
 * (lib/whatsapp.ts) on every deal-creation path — this card just owns the
 * two profile columns that gate it (migration 0017).
 */
export function WhatsAppSettingsCard({ profile, demo = false }: { profile: Profile; demo?: boolean }) {
  const { t } = useTranslation();
  const [state, formAction] = useActionState<UpdateWhatsAppState, FormData>(
    updateWhatsAppSettings,
    { error: null, saved: false },
  );
  const [enabled, setEnabled] = useState(profile.whatsapp_notifications_enabled);

  return (
    <GlassPanel className="p-6">
      <h2 className="text-sm font-semibold text-fg">{t("settings.whatsapp")}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-fg/50">{t("settings.whatsappNote")}</p>

      <form action={demo ? undefined : formAction} className="mt-4 space-y-3">
        <Field
          id="whatsapp_number"
          name="whatsapp_number"
          type="tel"
          label={t("settings.whatsappNumber")}
          placeholder="+201234567890"
          defaultValue={profile.whatsapp_number ?? ""}
        />

        <label className="flex items-center gap-2 text-sm text-fg/70">
          <input
            type="checkbox"
            name="whatsapp_notifications_enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-brand-green"
          />
          {t("settings.whatsappToggle")}
        </label>

        {state.error ? <Alert>{state.error}</Alert> : null}
        {state.saved ? <Alert tone="info">{t("common.saved")}</Alert> : null}

        <SaveButton demo={demo} />
      </form>
    </GlassPanel>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import { closeMyAccount } from "@/app/(app)/settings/actions";

/**
 * Settings → Delete account (migration 0044). The form asks for the password
 * and a confirmation word; the dialog asks once more. Only after the server
 * reports the account closed does the page leave for the sign-in screen, so
 * a refusal (wrong password, an open deal) stays on screen with its reason.
 */
export function DeleteAccountCard({ demo = false }: { demo?: boolean }) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    const form = formRef.current;
    if (!form || pending) return;
    const data = new FormData(form);
    setError(null);
    startTransition(async () => {
      try {
        const result = await closeMyAccount(null, data);
        if (result.ok) {
          window.location.assign("/login?closed=1");
          return;
        }
        setError(t(result.errorKey));
      } catch {
        setError(t("ui.errors.network"));
      }
      setOpen(false);
    });
  };

  return (
    <GlassPanel className="border-danger/30 p-6">
      <h2 className="text-base font-semibold text-danger">{t("settings.deleteAccount.title")}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{t("settings.deleteAccount.intro")}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{t("settings.deleteAccount.kept")}</p>
      <p className="mt-1.5 text-sm font-medium text-fg-secondary">{t("settings.deleteAccount.blocked")}</p>

      <form
        ref={formRef}
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (demo) return;
          setError(null);
          setOpen(true);
        }}
      >
        <Field id="delete_password" name="password" type="password" autoComplete="current-password" required label={t("settings.deleteAccount.password")} />
        <Field id="delete_confirm_word" name="confirm_word" required autoComplete="off" label={t("settings.deleteAccount.word")} />
        {error && !open ? (
          <div className="sm:col-span-2">
            <Alert>{error}</Alert>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" variant="danger" fullWidth={false} disabled={demo || pending}>
            {t("settings.deleteAccount.button")}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={confirm}
        title={t("settings.deleteAccount.confirmTitle")}
        body={t("settings.deleteAccount.confirmBody")}
        confirmLabel={t("settings.deleteAccount.confirm")}
        tone="danger"
        pending={pending}
        error={error}
      />
    </GlassPanel>
  );
}

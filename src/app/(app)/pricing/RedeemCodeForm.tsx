"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/LocaleProvider";
import { redeemCode, type RedeemCodeState } from "./actions";

function SubmitButton({ demo }: { demo: boolean }) {
  const { pending } = useFormStatus();
  const { t } = useTranslation();
  return (
    <Button
      type={demo ? "button" : "submit"}
      fullWidth={false}
      disabled={pending}
    >
      {pending ? t("common.redeeming") : t("common.redeem")}
    </Button>
  );
}

export function RedeemCodeForm({ demo = false }: { demo?: boolean }) {
  const { t } = useTranslation();
  const [state, formAction] = useActionState<RedeemCodeState, FormData>(
    redeemCode,
    { error: null, success: false },
  );

  return (
    <form
      action={demo ? undefined : formAction}
      className="mt-4 border-t border-fg/8 pt-4"
    >
      <label
        htmlFor="code"
        className="block text-xs font-medium tracking-wide text-fg/70 uppercase"
      >
        {t("pricing.promoCodeLabel")}
      </label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
        <input
          id="code"
          name="code"
          placeholder="XXXX-XXXX"
          autoComplete="off"
          className="h-11 min-w-[160px] flex-1 rounded-xl border border-fg/10 bg-fg/5 px-3.5 text-sm text-fg uppercase transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none"
        />
        <SubmitButton demo={demo} />
      </div>

      {state.error ? (
        <div className="mt-3">
          <Alert>{state.error}</Alert>
        </div>
      ) : null}
      {state.success ? (
        <p className="mt-3 text-sm text-brand-green">
          {t("pricing.redeemed")}
        </p>
      ) : null}
    </form>
  );
}

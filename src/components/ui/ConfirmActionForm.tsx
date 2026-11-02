"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import type { ActionResult } from "@/lib/ui/action-result";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * A form whose submit asks first. Pressing the trigger runs the browser's own
 * validation (required fields and so on), then opens a ConfirmDialog; only
 * "Confirm" calls the server action. The dialog stays open while the request
 * runs and shows the action's error if it fails; it closes, and the success
 * note appears, only when the action returned `ok: true`.
 *
 * Every string is a dictionary key, because this is often rendered by
 * server components that cannot translate. The server action still does its
 * own authorization; this adds a step for the person, not a security check.
 */
export function ConfirmActionForm({
  action,
  hidden,
  children,
  trigger,
  triggerClassName,
  titleKey,
  bodyKey,
  confirmKey,
  successKey,
  params,
  tone = "default",
  className = "",
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  hidden: Record<string, string>;
  children?: ReactNode;
  trigger: { labelKey: string; params?: Record<string, string | number> };
  triggerClassName: string;
  titleKey: string;
  bodyKey: string;
  confirmKey: string;
  successKey?: string;
  params?: Record<string, string | number>;
  tone?: "default" | "danger";
  className?: string;
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    setError(null);
    startTransition(async () => {
      let result: ActionResult;
      try {
        result = await action(null, data);
      } catch {
        result = { ok: false, errorKey: "ui.errors.network" };
      }
      if (result.ok) {
        setOpen(false);
        setDone(true);
      } else {
        setError(t(result.errorKey));
      }
    });
  };

  return (
    <>
      <form
        ref={formRef}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          setDone(false);
          setError(null);
          setOpen(true);
        }}
      >
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {children}
        <button type="submit" className={triggerClassName}>
          {t(trigger.labelKey, trigger.params)}
        </button>
        {error && !open ? (
          // The dialog was closed while the request was running (see Dialog):
          // the outcome must still be visible.
          <p role="alert" className="basis-full text-xs text-danger">
            {error}
          </p>
        ) : null}
        {done && successKey ? (
          <p role="status" className="basis-full text-xs text-success">
            {t(successKey, params)}
          </p>
        ) : null}
      </form>
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={confirm}
        title={t(titleKey, params)}
        body={t(bodyKey, params)}
        confirmLabel={t(confirmKey, params)}
        tone={tone}
        pending={pending}
        error={error}
      />
    </>
  );
}

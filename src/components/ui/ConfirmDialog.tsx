"use client";

import type { ReactNode } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { Dialog } from "./Dialog";

/**
 * Asks before an action runs. Cancel is focused first, so pressing Enter
 * straight after opening never confirms by accident. While `pending`, the
 * dialog cannot be dismissed and the confirm button says it is working; an
 * `error` stays inside the dialog so the person can retry or cancel.
 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "default",
  pending = false,
  error = null,
  children,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  pending?: boolean;
  error?: string | null;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const confirmClass =
    tone === "danger"
      ? "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20"
      : "bg-brand-green text-ink hover:brightness-110";

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={body}
      dismissible={!pending}
      size="sm"
      footer={
        <>
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-control border border-line bg-surface-muted px-4 text-sm text-fg transition hover:bg-surface-hover focus-visible:focus-ring disabled:opacity-50"
          >
            {cancelLabel ?? t("ui.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending}
            className={`inline-flex h-10 items-center justify-center rounded-control px-4 text-sm font-semibold transition focus-visible:focus-ring disabled:cursor-wait disabled:opacity-60 ${confirmClass}`}
          >
            {pending ? t("ui.working") : confirmLabel}
          </button>
        </>
      }
    >
      {children}
      {error ? (
        <p role="alert" className="mt-3 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

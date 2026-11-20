"use client";

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { statusKey, statusTone } from "@/lib/collab/display";

/** Shared pieces for the collaboration screens. Strings are dictionary keys. */

export const BTN_PRIMARY =
  "inline-flex h-10 items-center justify-center rounded-control bg-brand-green px-4 text-sm font-semibold text-ink transition hover:brightness-110 focus-visible:focus-ring disabled:opacity-50";
export const BTN_GHOST =
  "inline-flex h-10 items-center justify-center rounded-control border border-line bg-surface-muted px-4 text-sm font-medium text-fg transition hover:bg-surface-hover focus-visible:focus-ring";
export const BTN_DANGER =
  "inline-flex h-10 items-center justify-center rounded-control border border-danger/30 bg-danger/10 px-4 text-sm font-medium text-danger transition hover:bg-danger/20 focus-visible:focus-ring";

const CONTROL =
  "w-full rounded-control border border-line bg-surface-muted px-3 text-sm text-fg placeholder:text-fg-subtle focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none";

export function Status({ status }: { status: string }) {
  const { t } = useTranslation();
  return <StatusBadge tone={statusTone(status)}>{t(statusKey(status))}</StatusBadge>;
}

export function Labelled({ id, labelKey, hintKey, children }: { id: string; labelKey: string; hintKey?: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-fg-secondary">
        {t(labelKey)}
      </label>
      {children}
      {hintKey ? (
        <p id={`${id}-hint`} className="text-xs text-fg-muted">
          {t(hintKey)}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ id, labelKey, hintKey, ...rest }: InputHTMLAttributes<HTMLInputElement> & { id: string; labelKey: string; hintKey?: string }) {
  return (
    <Labelled id={id} labelKey={labelKey} hintKey={hintKey}>
      <input id={id} aria-describedby={hintKey ? `${id}-hint` : undefined} className={`h-10 ${CONTROL}`} {...rest} />
    </Labelled>
  );
}

export function TextArea({ id, labelKey, hintKey, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { id: string; labelKey: string; hintKey?: string }) {
  return (
    <Labelled id={id} labelKey={labelKey} hintKey={hintKey}>
      <textarea id={id} aria-describedby={hintKey ? `${id}-hint` : undefined} className={`min-h-24 py-2 ${CONTROL}`} {...rest} />
    </Labelled>
  );
}

export const SELECT_CLASS = `h-10 ${CONTROL}`;

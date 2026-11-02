"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslation } from "@/components/LocaleProvider";

/**
 * Modal dialog on the native <dialog> element. showModal() puts it in the top
 * layer (above the G panel, drawer and banners), makes the rest of the page
 * inert, moves focus inside, and on close the browser returns focus to the
 * element that opened it. Escape and a backdrop click close it unless
 * `dismissible` is false (e.g. while a request is in flight).
 *
 * Render it outside any <form>: a button inside a dialog nested in a form
 * would submit that form.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        // Escape. Keep the element's state in step with `open`.
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && dismissible) onClose();
      }}
      className={`gl-dialog m-auto w-[calc(100%-2rem)] ${width} rounded-card border border-line bg-white p-0 text-fg shadow-overlay backdrop:bg-transparent dark:bg-navy-dark`}
    >
      <div className="max-h-[85dvh] overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-base font-semibold text-fg">
            {title}
          </h2>
          {dismissible ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("ui.close")}
              className="-me-2 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-chip text-fg-muted transition hover:bg-surface-hover hover:text-fg focus-visible:focus-ring"
            >
              <span aria-hidden className="text-lg leading-none">×</span>
            </button>
          ) : null}
        </div>
        {description ? (
          <div id={descId} className="mt-2 text-sm leading-relaxed text-fg-muted">
            {description}
          </div>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}
        {footer ? (
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>
        ) : null}
      </div>
    </dialog>
  );
}

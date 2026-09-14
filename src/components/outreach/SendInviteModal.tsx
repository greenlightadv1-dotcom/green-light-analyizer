"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { useTranslation } from "@/components/LocaleProvider";

/**
 * Admin-only "send an email" control — a self-contained trigger + dialog
 * pair (same shape as ThemeMenu/LanguageMenu: the component owns its own
 * open/closed state, so dropping <SendInviteModal /> anywhere is enough).
 * POSTs to /api/emails/send, which is itself gated to an authenticated admin
 * session — this component doesn't duplicate that check, it just won't be
 * rendered for a non-admin caller (see TopBar.tsx).
 */

type OutreachType = "creator_outreach" | "system_notification";

type FormState = {
  to: string;
  creatorName: string;
  title: string;
  offerAmount: string;
  message: string;
  ctaUrl: string;
  ctaLabel: string;
};

const EMPTY_FORM: FormState = {
  to: "",
  creatorName: "",
  title: "",
  offerAmount: "",
  message: "",
  ctaUrl: "",
  ctaLabel: "",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const textareaClass =
  "w-full resize-y rounded-xl border border-fg/10 bg-fg/5 px-3.5 py-2.5 text-sm text-fg placeholder:text-fg/30 transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none";

export function SendInviteModal() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<OutreachType>("creator_outreach");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [serverError, setServerError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  function field<K extends keyof FormState>(key: K) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: event.target.value }));
  }

  function close() {
    if (status === "sending") return;
    setOpen(false);
    triggerRef.current?.focus();
  }

  // The Escape-key listener below lives inside a *long-lived* addEventListener
  // closure that only gets re-created when `open` changes — so it can't just
  // call close() directly, which would capture `status` from whenever the
  // listener was attached and go stale the moment a send starts mid-dialog.
  // A ref sidesteps that: it always reads the current status at keypress time.
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && statusRef.current !== "sending") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function openModal() {
    setForm(EMPTY_FORM);
    setErrors({});
    setServerError(null);
    setStatus("idle");
    setOpen(true);
  }

  function validate(): Partial<Record<keyof FormState, string>> {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (!form.to.trim() || !EMAIL_REGEX.test(form.to.trim())) {
      next.to = t("outreach.errorEmail");
    }
    if (!form.title.trim()) next.title = t("outreach.errorRequired");
    if (!form.message.trim()) next.message = t("outreach.errorRequired");

    if (type === "creator_outreach") {
      if (!form.creatorName.trim()) next.creatorName = t("outreach.errorRequired");
      const amount = Number(form.offerAmount);
      if (form.offerAmount.trim() === "" || !Number.isFinite(amount) || amount < 0) {
        next.offerAmount = t("outreach.errorAmount");
      }
      if (!form.ctaUrl.trim() || !isHttpUrl(form.ctaUrl.trim())) {
        next.ctaUrl = t("outreach.errorUrl");
      }
    } else if (form.ctaUrl.trim() && !isHttpUrl(form.ctaUrl.trim())) {
      // System notification: the CTA link is optional, but if given it must
      // still be a real http(s) URL — an empty field is not an error here.
      next.ctaUrl = t("outreach.errorUrl");
    }

    return next;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const fieldErrors = validate();
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setStatus("sending");
    setServerError(null);

    const defaultCtaLabel = t(
      type === "creator_outreach" ? "outreach.defaultCtaLabelOutreach" : "outreach.defaultCtaLabelNotification",
    );
    const ctaUrl = form.ctaUrl.trim();
    const ctaLabel = form.ctaLabel.trim() || defaultCtaLabel;

    const body =
      type === "creator_outreach"
        ? {
            type,
            to: form.to.trim(),
            creatorName: form.creatorName.trim(),
            campaignTitle: form.title.trim(),
            offerAmountUsd: Number(form.offerAmount),
            pitchDetails: form.message.trim(),
            ctaLabel,
            ctaUrl,
          }
        : {
            type,
            to: form.to.trim(),
            title: form.title.trim(),
            message: form.message.trim(),
            // ctaLabel/ctaUrl must arrive together or not at all (§ API contract).
            ...(ctaUrl ? { ctaUrl, ctaLabel } : {}),
          };

    try {
      const response = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: { error?: string } | null = await response.json().catch(() => null);

      if (!response.ok) {
        setServerError(data?.error ?? `Request failed (${response.status})`);
        setStatus("error");
        return;
      }

      setStatus("success");
      setForm(EMPTY_FORM);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Network error");
      setStatus("error");
    }
  }

  const titleLabel = t(type === "creator_outreach" ? "outreach.titleLabelOutreach" : "outreach.titleLabelNotification");
  const messageLabel = t(
    type === "creator_outreach" ? "outreach.messageLabelOutreach" : "outreach.messageLabelNotification",
  );
  const defaultCtaLabel = t(
    type === "creator_outreach" ? "outreach.defaultCtaLabelOutreach" : "outreach.defaultCtaLabelNotification",
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openModal}
        className="flex items-center gap-1.5 rounded-lg border border-brand-green/30 bg-brand-green/10 px-3 py-1.5 text-xs font-medium text-brand-green transition hover:bg-brand-green/20"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
          <path d="M4 4l16 8-16 8 3.5-8L4 4Z" />
        </svg>
        {t("outreach.sendInvite")}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              className="glass-panel-solid max-h-[90vh] w-full max-w-lg overflow-y-auto p-6 outline-none"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 id={titleId} className="text-base font-semibold text-fg">
                    {t("outreach.modalTitle")}
                  </h2>
                  <p className="mt-0.5 text-xs text-fg/40">{t("outreach.modalDescription")}</p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label={t("common.close")}
                  className="shrink-0 rounded-lg p-1.5 text-fg/45 transition hover:bg-fg/10 hover:text-fg"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              <div className="mb-4 flex gap-2">
                {(["creator_outreach", "system_notification"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setType(option);
                      // Field set and requirements differ per type (e.g. CTA
                      // link is required for one, optional for the other) —
                      // an error from the previous type's rules would
                      // otherwise linger under a field that's now valid.
                      setErrors({});
                    }}
                    aria-pressed={type === option}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                      type === option
                        ? "border-brand-green/30 bg-brand-green/10 text-brand-green"
                        : "border-fg/10 bg-fg/5 text-fg/60 hover:bg-fg/10 hover:text-fg"
                    }`}
                  >
                    {t(option === "creator_outreach" ? "outreach.typeCreatorOutreach" : "outreach.typeSystemNotification")}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Field
                    id="outreach-to"
                    name="to"
                    type="email"
                    label={t("outreach.recipientEmail")}
                    placeholder="creator@example.com"
                    value={form.to}
                    onChange={field("to")}
                  />
                  {errors.to ? <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.to}</p> : null}
                </div>

                {type === "creator_outreach" ? (
                  <div>
                    <Field
                      id="outreach-creator-name"
                      name="creatorName"
                      label={t("outreach.creatorName")}
                      value={form.creatorName}
                      onChange={field("creatorName")}
                    />
                    {errors.creatorName ? (
                      <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.creatorName}</p>
                    ) : null}
                  </div>
                ) : null}

                <div className={type === "creator_outreach" ? "grid gap-4 sm:grid-cols-2" : undefined}>
                  <div>
                    <Field
                      id="outreach-title"
                      name="title"
                      label={titleLabel}
                      value={form.title}
                      onChange={field("title")}
                    />
                    {errors.title ? <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.title}</p> : null}
                  </div>

                  {type === "creator_outreach" ? (
                    <div>
                      <Field
                        id="outreach-offer-amount"
                        name="offerAmount"
                        type="number"
                        min={0}
                        step="any"
                        label={t("outreach.offerAmount")}
                        value={form.offerAmount}
                        onChange={field("offerAmount")}
                      />
                      {errors.offerAmount ? (
                        <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.offerAmount}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="outreach-message" className="block text-xs font-medium tracking-wide text-fg/70 uppercase">
                    {messageLabel}
                  </label>
                  <textarea
                    id="outreach-message"
                    name="message"
                    rows={4}
                    maxLength={10000}
                    className={textareaClass}
                    value={form.message}
                    onChange={field("message")}
                  />
                  {errors.message ? <p className="text-xs text-red-700 dark:text-red-300">{errors.message}</p> : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Field
                      id="outreach-cta-url"
                      name="ctaUrl"
                      type="url"
                      label={t("outreach.ctaUrl")}
                      placeholder="https://example.com"
                      value={form.ctaUrl}
                      onChange={field("ctaUrl")}
                    />
                    {errors.ctaUrl ? <p className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.ctaUrl}</p> : null}
                  </div>
                  <Field
                    id="outreach-cta-label"
                    name="ctaLabel"
                    label={t("outreach.ctaLabel")}
                    placeholder={defaultCtaLabel}
                    hint={t("outreach.ctaLabelHint", { default: defaultCtaLabel })}
                    value={form.ctaLabel}
                    onChange={field("ctaLabel")}
                  />
                </div>

                {status === "error" && serverError ? <Alert>{serverError}</Alert> : null}
                {status === "success" ? <Alert tone="info">{t("outreach.successMessage")}</Alert> : null}

                <Button type="submit" disabled={status === "sending"}>
                  {status === "sending" ? t("common.sending") : t("outreach.sendButton")}
                </Button>
              </form>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

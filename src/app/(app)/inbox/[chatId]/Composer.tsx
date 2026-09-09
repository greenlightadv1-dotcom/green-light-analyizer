"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { useTranslation } from "@/components/LocaleProvider";
import { maskSensitiveData } from "@/lib/mask";
import { sendMessage, generateReply, type ReplyDraftState, type SendMessageState } from "./actions";

const RULE_LABEL_KEYS: Record<string, string> = {
  email: "inbox.ruleEmail",
  phone: "inbox.rulePhone",
  social: "inbox.ruleSocial",
};

const DEMO_DRAFT =
  "Thanks for reaching out — I'd be glad to work on this. Based on my typical reach and audience fit, I'd suggest $2,100 for this deliverable. Happy to move forward once that works for you.";

function SendButton() {
  const { pending } = useFormStatus();
  const { t } = useTranslation();
  return (
    <Button type="submit" disabled={pending} fullWidth={false} className="px-6">
      {pending ? t("common.sending") : t("common.send")}
    </Button>
  );
}

function GenerateDraftButton() {
  const { pending } = useFormStatus();
  const { t } = useTranslation();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-fg/10 bg-fg/5 px-3 py-1.5 text-xs text-fg/70 transition hover:bg-fg/10 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? t("inbox.generatingDraft") : t("inbox.generateDraft")}
    </button>
  );
}

export function Composer({
  chatId,
  demo = false,
  onDemoSend,
}: {
  chatId: string;
  /**
   * UI preview mode: masks and echoes locally instead of calling the server
   * action, which needs a database the preview deployment has no keys for.
   *
   * The masking is the REAL §6.1 utility, not a stub — so the preview
   * demonstrates the actual filter. It stays a preview-only path: in the app
   * proper, masking happens server-side before persistence, because a
   * client-side filter is one devtools call away from being bypassed.
   */
  demo?: boolean;
  onDemoSend?: (maskedText: string) => void;
}) {
  const { t } = useTranslation();
  const [state, formAction] = useActionState<SendMessageState, FormData>(
    sendMessage,
    { error: null, violation: null, relayFailed: false },
  );
  const [draftState, draftAction] = useActionState<ReplyDraftState, FormData>(
    generateReply,
    { error: null, draft: null },
  );
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [demoViolation, setDemoViolation] = useState<string[] | null>(null);
  const [demoDraft, setDemoDraft] = useState<string | null>(null);

  const draft = demo ? demoDraft : draftState.draft;

  function useDraft() {
    if (!draft || !textareaRef.current) return;
    textareaRef.current.value = draft;
    textareaRef.current.focus();
  }

  function ruleList(rules: string[]) {
    return rules.map((r) => (RULE_LABEL_KEYS[r] ? t(RULE_LABEL_KEYS[r]) : r)).join(` ${t("common.and")} `);
  }

  function handleDemoSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = formRef.current?.elements.namedItem(
      "message_text",
    ) as HTMLTextAreaElement | null;
    const raw = field?.value.trim();
    if (!raw) return;

    const { maskedText, isMasked, matched } = maskSensitiveData(raw);
    onDemoSend?.(maskedText);
    setDemoViolation(isMasked ? matched : null);
    formRef.current?.reset();
  }

  // Clear the box once the server has accepted the message. Deliberately not
  // an optimistic update: what gets stored is the *masked* text, so echoing the
  // raw draft into the thread would show the sender something the room does
  // not actually contain.
  useEffect(() => {
    if (!demo && !state.error) formRef.current?.reset();
  }, [state, demo]);

  return (
    <div className="space-y-2.5">
      <div>
        <form
          action={demo ? undefined : draftAction}
          onSubmit={
            demo
              ? (event) => {
                  event.preventDefault();
                  setDemoDraft(DEMO_DRAFT);
                }
              : undefined
          }
        >
          <input type="hidden" name="chat_id" value={chatId} />
          <GenerateDraftButton />
        </form>

        {!demo && draftState.error ? (
          <p className="mt-1.5 text-xs text-red-700 dark:text-red-300">{draftState.error}</p>
        ) : null}

        {draft ? (
          <div className="mt-2 rounded-xl border border-brand-green/20 bg-brand-green/5 p-3">
            <p className="text-xs leading-relaxed text-fg/70 whitespace-pre-wrap">{draft}</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={useDraft}
                className="rounded-lg border border-brand-green/30 bg-brand-green/10 px-2.5 py-1 text-[11px] font-medium text-brand-green transition hover:bg-brand-green/20"
              >
                {t("inbox.useDraft")}
              </button>
              <CopyButton value={draft} />
            </div>
          </div>
        ) : null}
      </div>

      <form
        ref={formRef}
        action={demo ? undefined : formAction}
        onSubmit={demo ? handleDemoSubmit : undefined}
        className="space-y-2.5"
      >
        <input type="hidden" name="chat_id" value={chatId} />

        <div className="flex items-end gap-2">
          <label htmlFor="message_text" className="sr-only">
            {t("inbox.message")}
          </label>
          <textarea
            ref={textareaRef}
            id="message_text"
            name="message_text"
            rows={2}
            maxLength={4000}
            required
            placeholder={t("inbox.writeReply")}
            className="min-h-11 w-full min-w-0 flex-1 resize-y rounded-xl border border-fg/10 bg-fg/5 px-3.5 py-2.5 text-sm text-fg placeholder:text-fg/30 transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none"
          />
          <SendButton />
        </div>

        {state.error ? (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}

      {state.relayFailed ? (
        <p
          role="alert"
          className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-100"
        >
          {t("inbox.relayFailed")}
        </p>
      ) : null}

      {demoViolation ? (
        <p
          role="alert"
          className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-100"
        >
          {t("inbox.contactRemovedDemo", { rules: ruleList(demoViolation) })}
        </p>
      ) : null}

      {state.violation ? (
        <p
          role="alert"
          className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-100"
        >
          {t("inbox.contactRemovedLive", { rules: ruleList(state.violation.rules) })}
        </p>
      ) : null}

      <p className="text-[11px] text-fg/30">
        {t("inbox.maskingFooterNote")}
      </p>
      </form>
    </div>
  );
}

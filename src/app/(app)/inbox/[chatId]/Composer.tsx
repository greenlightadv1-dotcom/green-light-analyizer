"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/components/LocaleProvider";
import { maskSensitiveData } from "@/lib/mask";
import { sendMessage, type SendMessageState } from "./actions";

const RULE_LABEL_KEYS: Record<string, string> = {
  email: "inbox.ruleEmail",
  phone: "inbox.rulePhone",
  social: "inbox.ruleSocial",
};

function SendButton() {
  const { pending } = useFormStatus();
  const { t } = useTranslation();
  return (
    <Button type="submit" disabled={pending} fullWidth={false} className="px-6">
      {pending ? t("common.sending") : t("common.send")}
    </Button>
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
  const formRef = useRef<HTMLFormElement>(null);
  const [demoViolation, setDemoViolation] = useState<string[] | null>(null);

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
  );
}

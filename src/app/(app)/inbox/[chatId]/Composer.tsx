"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { maskSensitiveData } from "@/lib/mask";
import { sendMessage, type SendMessageState } from "./actions";

const RULE_LABELS: Record<string, string> = {
  email: "an email address",
  phone: "a phone number",
  social: "an external messaging link",
};

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} fullWidth={false} className="px-6">
      {pending ? "Sending…" : "Send"}
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
  const [state, formAction] = useActionState<SendMessageState, FormData>(
    sendMessage,
    { error: null, violation: null, relayFailed: false },
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [demoViolation, setDemoViolation] = useState<string[] | null>(null);

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
          Message
        </label>
        <textarea
          id="message_text"
          name="message_text"
          rows={2}
          maxLength={4000}
          required
          placeholder="Write a reply…"
          className="min-h-11 w-full min-w-0 flex-1 resize-y rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none"
        />
        <SendButton />
      </div>

      {state.error ? (
        <p role="alert" className="text-xs text-red-300">
          {state.error}
        </p>
      ) : null}

      {state.relayFailed ? (
        <p
          role="alert"
          className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs leading-relaxed text-amber-100"
        >
          Saved to the conversation, but we could not email it to the company
          just yet. Our team has been alerted — you do not need to resend.
        </p>
      ) : null}

      {demoViolation ? (
        <p
          role="alert"
          className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs leading-relaxed text-amber-100"
        >
          Contact details were removed:{" "}
          {demoViolation.map((r) => RULE_LABELS[r] ?? r).join(" and ")}. In the
          live product this is also logged for admin review and can permanently
          close the account.
        </p>
      ) : null}

      {state.violation ? (
        <p
          role="alert"
          className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs leading-relaxed text-amber-100"
        >
          Your message was sent, but{" "}
          {state.violation.rules
            .map((r) => RULE_LABELS[r] ?? r)
            .join(" and ")}{" "}
          was removed. Sharing direct contact details or moving a deal
          off-platform breaches the terms and can permanently close your
          account — this attempt has been logged for review.
        </p>
      ) : null}

      <p className="text-[11px] text-white/30">
        Emails, phone numbers and WhatsApp / Telegram / Discord links are removed
        automatically before your message is saved.
      </p>
    </form>
  );
}

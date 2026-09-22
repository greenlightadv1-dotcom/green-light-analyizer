"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CopyButton } from "@/components/ui/CopyButton";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import { sendMessage, type SendMessageState } from "@/app/(app)/inbox/[chatId]/actions";

/**
 * One-click reply to an emailed offer, pre-populated with the deal's own
 * structured context (deliverable, what they offered, the creator's rate)
 * above a ready-to-send message.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Why this is not a `mailto:` link
 * ───────────────────────────────────────────────────────────────────────────
 * A `mailto:` hands the message to the creator's own mail client, which sends
 * it from the creator's own address. That address then sits in the sponsor's
 * inbox forever, and §6 exists specifically to stop that:
 *
 *   "When a creator replies in-app, the reply is relayed to the company as an
 *    official email sent from the platform's own server — the company never
 *    sees the creator's real address."
 *
 * It is not only a privacy rule. §1's second value proposition is that the
 * commission cannot be bypassed *because* there is no direct channel, §12
 * makes the address a security requirement rather than a UI convention, and
 * the published Privacy Policy tells creators this is how it works. A mailto
 * button would quietly undo all three on the most-used path in the product.
 *
 * So the button does what the request actually wanted — a pre-filled reply,
 * sent in one click — over the platform's own relay: the sponsor receives it
 * from the platform address, with the creator's inbound alias as reply-to, so
 * their answer comes back into this same room.
 *
 * The text is editable before it goes. It is submitted through the same
 * `sendMessage` action the composer uses, so it gets the identical §6.1
 * server-side mask, violation log and relay handling — a second send path
 * with its own rules is exactly how a masking guarantee develops a hole.
 */
function SendButton({ demo }: { demo: boolean }) {
  const { pending } = useFormStatus();
  const { t } = useTranslation();
  return (
    <button
      // Inert in the preview, same as StatusControl: a submit button in a
      // form with no action navigates the page away.
      type={demo ? "button" : "submit"}
      disabled={pending}
      className="rounded-lg border border-brand-green/30 bg-brand-green/10 px-3 py-1.5 text-xs font-medium text-brand-green transition hover:bg-brand-green/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? t("inbox.directReplySending") : t("inbox.directReplySend")}
    </button>
  );
}

export function DirectReplyPanel({
  chatId,
  senderEmail,
  /** Composed server-side from the deal row — see lib/deals/reply-template.ts. */
  initialBody,
  demo = false,
}: {
  chatId: string;
  senderEmail: string;
  initialBody: string;
  demo?: boolean;
}) {
  const { t } = useTranslation();
  const [body, setBody] = useState(initialBody);
  const [state, formAction] = useActionState<SendMessageState, FormData>(sendMessage, {
    sent: false,
    error: null,
    violation: null,
    relayFailed: false,
  });

  return (
    <GlassPanel className="p-5">
      <h2 className="text-sm font-semibold text-fg">{t("inbox.directReply")}</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-fg/45">
        {t("inbox.directReplyIntro", { sender: senderEmail })}
      </p>

      <form action={demo ? undefined : formAction} className="mt-3 space-y-2.5">
        <input type="hidden" name="chat_id" value={chatId} />
        <label htmlFor="direct_reply_text" className="sr-only">
          {t("inbox.message")}
        </label>
        <textarea
          id="direct_reply_text"
          name="message_text"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={8}
          maxLength={4000}
          required
          className="w-full resize-y rounded-xl border border-fg/10 bg-fg/5 px-3 py-2.5 text-xs leading-relaxed text-fg transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none"
        />

        <div className="flex flex-wrap items-center gap-2">
          <SendButton demo={demo} />
          <CopyButton value={body} className="px-3 py-1.5" />
        </div>

        {state.sent && !state.relayFailed ? (
          <p className="text-xs text-brand-green">{t("inbox.directReplySent")}</p>
        ) : null}

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

        <p className="text-[11px] leading-relaxed text-fg/30">
          {t("inbox.directReplyFrom")}
        </p>
      </form>
    </GlassPanel>
  );
}

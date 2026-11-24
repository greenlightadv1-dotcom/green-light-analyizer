"use client";

import { useActionState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { activationForWhatsApp, type WhatsAppActivationState } from "@/app/(app)/admin/verification/actions";

/**
 * Reviewer only: makes a fresh activation link (also emailed) and offers it
 * on WhatsApp. The chat opens only when the reviewer clicks the link, so no
 * popup blocker is involved and nothing is sent until they press send in
 * WhatsApp. Admin pages are English-only (CLAUDE.md §15).
 */
export function WhatsAppActivationButton({ caseId, hasPhone }: { caseId: string; hasPhone: boolean }) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState<WhatsAppActivationState | null, FormData>(activationForWhatsApp, null);
  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="case_id" value={caseId} />
        <button type="submit" disabled={pending} className="inline-flex w-full items-center justify-center rounded-control bg-[#25D366] px-3 py-2 text-xs font-semibold text-ink transition hover:brightness-95 disabled:opacity-60 focus-visible:focus-ring">
          {pending ? "Preparing…" : "Send activation link on WhatsApp"}
        </button>
      </form>
      {!hasPhone ? <p className="text-xs text-fg-muted">No valid WhatsApp number on this application. You can still copy the link once it is made.</p> : null}
      {state && !state.ok && state.errorKey ? <p role="alert" className="text-xs text-danger">{t(state.errorKey)}</p> : null}
      {state?.ok && state.link ? (
        <div className="space-y-2 rounded-control border border-line bg-surface p-2">
          <p className="text-xs text-fg-secondary">A new link was made and emailed. Earlier links no longer work. It is valid once, for 48 hours.</p>
          {state.url ? (
            <a href={state.url} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center rounded-control border border-[#25D366] px-3 py-2 text-xs font-semibold text-fg hover:bg-surface-hover focus-visible:focus-ring">
              Open WhatsApp chat with the applicant
            </a>
          ) : null}
          <button type="button" onClick={() => void navigator.clipboard?.writeText(state.link ?? "")} className="inline-flex w-full items-center justify-center rounded-control border border-line px-3 py-2 text-xs text-fg hover:bg-surface-hover focus-visible:focus-ring">
            Copy the link
          </button>
        </div>
      ) : null}
    </div>
  );
}

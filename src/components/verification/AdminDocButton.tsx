"use client";

import { useActionState, useEffect } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { viewVerificationDocument, type ViewState } from "@/app/(app)/admin/verification/actions";

/** Admin only: opens a 5-minute signed link to one document; each view is recorded in the case history. */
export function AdminDocButton({ documentId, label }: { documentId: string; label: string }) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState<ViewState | null, FormData>(viewVerificationDocument, null);
  useEffect(() => {
    if (state?.ok && state.url) window.open(state.url, "_blank", "noopener,noreferrer");
  }, [state]);
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="document_id" value={documentId} />
      <button type="submit" disabled={pending} className="rounded-chip border border-line bg-surface-muted px-3 py-1 text-xs text-fg hover:bg-surface-hover focus-visible:focus-ring">
        {label}
      </button>
      {state && !state.ok && state.errorKey ? <span role="alert" className="text-xs text-danger">{t(state.errorKey)}</span> : null}
    </form>
  );
}

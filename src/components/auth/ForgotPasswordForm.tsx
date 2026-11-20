"use client";

import Link from "next/link";
import { useActionState, useSyncExternalStore } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { GlassPanel } from "@/components/ui/GlassPanel";
import type { ForgotState } from "@/app/(auth)/forgot-password/actions";

const INPUT = "mt-1 h-10 w-full rounded-control border border-line bg-surface-muted px-3 text-sm text-fg";
type LinkProblem = "expired" | "invalid" | "browser";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
function readHashErrorCode(): string | null {
  return new URLSearchParams(window.location.hash.replace(/^#/, "")).get("error_code");
}

/**
 * Request a recovery link. After submitting, the same confirmation is shown
 * for every well-formed address, whether or not it has an account.
 */
export function ForgotPasswordForm({ action, linkProblem }: { action: (p: ForgotState, fd: FormData) => Promise<ForgotState>; linkProblem: LinkProblem | null }) {
  const { t } = useTranslation();
  const [state, formAction, pending] = useActionState<ForgotState, FormData>(action, { status: "idle" });
  // Supabase may report a used or expired emailed link only in the URL
  // fragment, which the server never sees (a redirect without a fragment keeps
  // the original). Read it as an external store, not via an effect.
  const hashCode = useSyncExternalStore(subscribeHash, readHashErrorCode, () => null);
  const problem: LinkProblem | null = hashCode ? (hashCode === "otp_expired" ? "expired" : linkProblem ?? "invalid") : linkProblem;

  return (
    <GlassPanel className="space-y-4 p-7 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold text-fg sm:text-3xl">{t("passwordReset.requestTitle")}</h1>
        <p className="mt-1.5 text-sm text-fg-muted">{t("passwordReset.requestIntro")}</p>
      </div>
      {problem && state.status === "idle" ? (
        <p role="alert" data-testid="link-problem" className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          {t(`passwordReset.link.${problem}`)}
        </p>
      ) : null}
      {state.status === "sent" ? (
        <div role="status" data-testid="reset-sent" className="space-y-2 rounded-lg border border-brand-green/30 bg-brand-green/10 px-3 py-3 text-sm text-fg">
          <p className="font-medium">{t("passwordReset.sentTitle")}</p>
          <p className="text-fg-secondary">{t("passwordReset.sentBody")}</p>
        </div>
      ) : (
        <form action={formAction} className="space-y-3" noValidate>
          <label className="block text-xs font-medium text-fg-secondary">
            {t("passwordReset.email")}
            <input name="email" type="email" required maxLength={254} dir="ltr" autoComplete="email" className={INPUT} />
          </label>
          {state.status === "invalid_email" || state.status === "rate_limited" || state.status === "unavailable" ? (
            <p role="alert" className="text-sm text-danger">{t(`passwordReset.errors.${state.status}`)}</p>
          ) : null}
          <button type="submit" disabled={pending} className="inline-flex h-10 items-center justify-center rounded-control bg-brand-green px-4 text-sm font-semibold text-ink disabled:opacity-50">
            {pending ? t("passwordReset.sending") : t("passwordReset.send")}
          </button>
        </form>
      )}
      <p className="text-sm">
        <Link href="/login" className="text-accent underline underline-offset-2">{t("passwordReset.backToSignIn")}</Link>
      </p>
    </GlassPanel>
  );
}

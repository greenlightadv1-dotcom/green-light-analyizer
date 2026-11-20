import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { amrFromAccessToken, isRecoveryOnlySession, maskEmail } from "@/lib/auth/recovery";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";
import { resetPassword } from "./actions";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Public path. Three states, decided on the server:
 *   - recovery session: the form, naming the (masked) account it resets;
 *   - ordinary signed-in session: pointed to Settings, no form;
 *   - no session (link missing, expired, or already used): asked for a new link.
 */
export default async function ResetPasswordPage() {
  let state: "ready" | "signed_in" | "missing" = "missing";
  let email: string | null = null;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: { session } } = await supabase.auth.getSession();
      if (isRecoveryOnlySession(amrFromAccessToken(session?.access_token))) {
        state = "ready";
        email = maskEmail(user.email);
      } else state = "signed_in";
    }
  }
  return <ResetPasswordForm state={state} email={email} action={resetPassword} />;
}

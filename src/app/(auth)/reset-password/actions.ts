"use server";

import { redirect } from "next/navigation";
import { amrFromAccessToken, isRecoveryOnlySession } from "@/lib/auth/recovery";
import { log } from "@/lib/log";
import { passwordProblems } from "@/lib/registration";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ResetState = { errorKey: string | null; problems?: string[] };

/**
 * Set a new password from a recovery session, then end EVERY session of the
 * account (all devices) and send the person to sign in with it. Only a
 * recovery-only session may use this: an ordinary signed-in user changes their
 * password in Settings, and this action refuses them, so it can never become a
 * "change password without the old one" back door for a live session.
 */
export async function resetPassword(_prev: ResetState, fd: FormData): Promise<ResetState> {
  const password = String(fd.get("password") ?? "");
  const problems = passwordProblems(password);
  if (problems.length) return { errorKey: "passwordReset.errors.password", problems };
  if (password !== String(fd.get("confirm") ?? "")) return { errorKey: "passwordReset.errors.mismatch" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();
  if (!user || !session || !isRecoveryOnlySession(amrFromAccessToken(session.access_token))) {
    return { errorKey: "passwordReset.errors.session" };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    log.warn("password_reset.update_failed", { code: error.code ?? null, status: error.status ?? null });
    return { errorKey: error.code === "same_password" ? "passwordReset.errors.same" : error.code === "weak_password" ? "passwordReset.errors.password" : "passwordReset.errors.generic" };
  }

  // A forced first-login change (§4.2) is satisfied: the person just chose
  // their own password. Clear the gate the same way set-password does.
  if (user.app_metadata?.must_change_password === true) {
    const admin = createAdminClient();
    const { error: flagError } = await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, must_change_password: false } });
    if (flagError) log.error("password_reset.flag_clear_failed", { user_id: user.id, error: flagError });
    else await admin.from("profiles").update({ must_change_password: false }).eq("id", user.id);
  }

  // Revoke every refresh token of the account, this browser's included.
  const { error: outError } = await supabase.auth.signOut({ scope: "global" });
  if (outError) log.error("password_reset.global_signout_failed", { user_id: user.id, code: outError.code ?? null });
  log.info("password_reset.completed", { user_id: user.id });
  redirect("/login?reset=done");
}

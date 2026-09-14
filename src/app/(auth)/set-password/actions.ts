"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SetPasswordState = { error: string | null };

/** Minimum viable strength. Tighten once the client confirms a policy. */
const MIN_LENGTH = 10;

/**
 * Forced password change on first login (§4.2, §12).
 *
 * The whole point is that this is enforced on the server: the middleware pins
 * the user to this screen, and the `must_change_password` flag lives in
 * app_metadata, which only the service role can clear. A user cannot skip it
 * by editing their own metadata or by navigating away.
 */
export async function setPassword(
  _prev: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < MIN_LENGTH) {
    return { error: `Use at least ${MIN_LENGTH} characters.` };
  }
  if (password !== confirm) {
    return { error: "The two passwords don't match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (user.app_metadata?.must_change_password !== true) {
    // Nothing to do — this screen is not a general "change password" form.
    redirect("/dashboard");
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return {
      error:
        updateError.message ||
        "That password could not be set. Try a different one.",
    };
  }

  // Only now clear the gate, and only via the service role.
  const admin = createAdminClient();
  const { error: flagError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, must_change_password: false },
  });

  if (flagError) {
    // The password did change, but the gate is still up. Say so plainly rather
    // than bouncing the user around a redirect loop they can't explain.
    return {
      error:
        "Your password was updated, but we couldn't finish activating the account. Contact support in Discord.",
    };
  }

  // Keep the profiles mirror in step (display/admin use only — see 0002).
  await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);

  // Re-issue the session so the refreshed app_metadata reaches the cookie and
  // the middleware stops redirecting back here.
  await supabase.auth.refreshSession();

  redirect("/dashboard");
}

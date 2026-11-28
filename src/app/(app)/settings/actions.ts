"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { closeAccount, passwordMatches } from "@/lib/account/close";
import { confirmWordMatches } from "@/lib/account/close-rules";
import { consumeRateLimit } from "@/lib/rate-limit";
import { OK, fail, type ActionResult } from "@/lib/ui/action-result";
import { isValidWhatsAppNumber } from "@/lib/whatsapp";
import { nameHasContact } from "@/lib/name-contact";

/** Matches set-password/actions.ts's forced-reset policy. */
const MIN_PASSWORD_LENGTH = 10;

export type UpdateDisplayNameState = { error: string | null; saved: boolean };

/** Settings -> Account: the one profile field a creator/company can rename themselves. */
export async function updateDisplayName(
  _prev: UpdateDisplayNameState,
  formData: FormData,
): Promise<UpdateDisplayNameState> {
  const profile = await requireProfile();

  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName) return { error: "Enter your name.", saved: false };
  if (fullName.length > 200) return { error: "That name is too long.", saved: false };
  if (nameHasContact(fullName)) return { error: "actionErrors.nameHasContact", saved: false };

  // The user's own client, not the service role — full_name is the one column
  // migration 0003 grants UPDATE on to `authenticated`, scoped by RLS to the
  // caller's own row. No cross-row check is needed here, unlike the Media Kit
  // slug write which does need the admin client.
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", profile.id);

  if (error) return { error: "actionErrors.nameNotChanged", saved: false };

  revalidatePath("/settings");
  return { error: null, saved: true };
}

export type ChangePasswordState = { error: string | null; saved: boolean };

/**
 * Settings -> Account: voluntary password change. Distinct from
 * (auth)/set-password's forced first-login reset — there is no
 * must_change_password gate to clear here, just `auth.updateUser`.
 */
export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  await requireProfile();

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.`, saved: false };
  }
  if (password !== confirm) {
    return { error: "The two passwords don't match.", saved: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error: error.message || "That password could not be set. Try a different one.",
      saved: false,
    };
  }

  return { error: null, saved: true };
}

export type UpdateWhatsAppState = { error: string | null; saved: boolean };

/** Settings -> WhatsApp: number + the notifyNewDeal() opt-in toggle (migration 0017). */
export async function updateWhatsAppSettings(
  _prev: UpdateWhatsAppState,
  formData: FormData,
): Promise<UpdateWhatsAppState> {
  const profile = await requireProfile();

  const rawNumber = String(formData.get("whatsapp_number") ?? "").trim();
  const enabled = formData.get("whatsapp_notifications_enabled") === "on";

  if (rawNumber && !isValidWhatsAppNumber(rawNumber)) {
    return {
      error: "Enter a valid WhatsApp number in international format, e.g. +201234567890.",
      saved: false,
    };
  }
  if (enabled && !rawNumber) {
    return { error: "Add a WhatsApp number before enabling notifications.", saved: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      whatsapp_number: rawNumber || null,
      whatsapp_notifications_enabled: enabled,
    })
    .eq("id", profile.id);

  if (error) return { error: "actionErrors.whatsappNotChanged", saved: false };

  revalidatePath("/settings");
  return { error: null, saved: true };
}

/**
 * Settings → Delete account (migration 0044). Creators and companies only;
 * the person retypes their password and a confirmation word, so a session
 * left open on another device cannot close the account. The actor is the
 * session's own profile, never anything in the form.
 */
export async function closeMyAccount(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const profile = await requireProfile();
  if (profile.role === "admin") return fail("settings.deleteAccount.errorAdmin");
  if (!confirmWordMatches(formData.get("confirm_word"))) return fail("settings.deleteAccount.errorWord");

  const limit = await consumeRateLimit("account_close", profile.id);
  if (!limit.allowed) return fail("settings.deleteAccount.errorRateLimited");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const email = auth.user?.email ?? "";
  if (!(await passwordMatches(email, String(formData.get("password") ?? "")))) {
    return fail("settings.deleteAccount.errorPassword");
  }

  const result = await closeAccount(profile.id);
  if (!result.ok) return fail(result.errorKey);
  await supabase.auth.signOut().catch(() => {});
  return OK;
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SET_PASSWORD_PATH } from "@/lib/supabase/session";

export type LoginState = { error: string | null };

/**
 * Sign in with the credentials an admin issued (§4.1 — accounts are created by
 * an admin; there is no public registration anywhere in this product).
 */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Deliberately non-specific: do not confirm whether an account exists.
    return { error: "Those credentials don't match an active account." };
  }

  if (data.user?.app_metadata?.must_change_password === true) {
    redirect(SET_PASSWORD_PATH);
  }

  redirect(next && next.startsWith("/") ? next : "/dashboard");
}

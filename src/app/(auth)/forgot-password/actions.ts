"use server";

import { createHash } from "node:crypto";
import { clientKey } from "@/lib/client-key";
import { log } from "@/lib/log";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isEmailShape, RECOVERY_CALLBACK_PATH } from "@/lib/auth/recovery";
import { siteUrl } from "@/lib/constants/site";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";

export type ForgotState = { status: "idle" | "sent" | "invalid_email" | "rate_limited" | "unavailable" };

/**
 * Ask Supabase to email a recovery link. The answer is the same whether or not
 * the address has an account (no enumeration): Supabase itself answers 200 for
 * unknown addresses and only mails real ones, and any provider error is logged
 * and swallowed, never shown. The only distinct answers are a malformed
 * address (checked before anything is looked up) and the rate limit, whose
 * keys exist for every address alike.
 */
export async function requestPasswordReset(_prev: ForgotState, fd: FormData): Promise<ForgotState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!isEmailShape(email)) return { status: "invalid_email" };
  if (!isSupabaseConfigured()) return { status: "unavailable" };

  const emailKey = `email:${createHash("sha256").update(email).digest("hex").slice(0, 32)}`;
  const [byClient, byEmail] = await Promise.all([
    consumeRateLimit("password_reset_client", await clientKey()),
    consumeRateLimit("password_reset", emailKey),
  ]);
  if (!byClient.allowed || !byEmail.allowed) return { status: "rate_limited" };

  // The server client stores the PKCE code verifier in a cookie on this
  // browser; /auth/recovery exchanges it (or a token_hash, see the runbook).
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}${RECOVERY_CALLBACK_PATH}`,
  });
  // Never log the address. The status and code are enough to diagnose.
  if (error) log.warn("password_reset.request_failed", { code: error.code ?? null, status: error.status ?? null });
  return { status: "sent" };
}

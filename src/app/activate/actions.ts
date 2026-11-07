"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { clientKey } from "@/lib/client-key";
import { generateInboundAlias } from "@/lib/alias";
import { passwordProblems } from "@/lib/registration";
import { runActivation } from "@/lib/verification/activate";
import { activationErrorKey, hashToken, isTokenShape } from "@/lib/verification/tokens";
import { clearApplicationCookie } from "@/lib/verification/application";

export type ActivateState = { errorKey: string | null; problems?: string[] };

/**
 * Create the account from an approved application's one-time link
 * (docs/ACCOUNT_ACTIVATION_FLOW.md). The token is checked, locked and spent
 * by the database; the password is chosen here and never emailed; the auth
 * user is created only now, already confirmed (the applicant proved the
 * address by opening the emailed links). runActivation() sequences the steps
 * so a failure at any point is recoverable and one token never makes two
 * accounts.
 */
export async function activateAccount(_prev: ActivateState, fd: FormData): Promise<ActivateState> {
  const raw = fd.get("token");
  if (!isTokenShape(raw)) return { errorKey: "activation.errors.not_found" };
  if (!(await consumeRateLimit("activation", await clientKey())).allowed) return { errorKey: "activation.errors.rate_limited" };
  const password = String(fd.get("password") ?? "");
  const problems = passwordProblems(password);
  if (problems.length) return { errorKey: "activation.errors.password", problems };
  if (password !== String(fd.get("confirm") ?? "")) return { errorKey: "activation.errors.mismatch" };
  if (fd.get("terms") !== "on") return { errorKey: "activation.errors.terms" };

  const hash = hashToken(raw);
  const service = createAdminClient();
  const result = await runActivation(
    {
      async claim(h) {
        const { data, error } = await service.rpc("activation_claim", { p_hash: h });
        return { row: data?.[0] ?? null, error: error?.message ?? (data?.[0] ? null : "activation:not_found") };
      },
      async createAuthUser(email, pw) {
        const { data, error } = await service.auth.admin.createUser({
          email,
          password: pw,
          email_confirm: true,
          app_metadata: { must_change_password: false },
        });
        if (data?.user) return { id: data.user.id, error: null };
        const exists = error?.code === "email_exists" || /already (been )?registered/i.test(error?.message ?? "");
        log.warn("activation.create_user_failed", { code: error?.code ?? null, status: error?.status ?? null });
        return { id: null, error: exists ? "email_exists" : "failed" };
      },
      async setPassword(userId, pw) {
        const { error } = await service.auth.admin.updateUserById(userId, { password: pw });
        return !error;
      },
      async checkpoint(h, userId) {
        const { error } = await service.rpc("activation_checkpoint", { p_hash: h, p_user: userId });
        if (error) log.error("activation.checkpoint_failed", { error });
        return !error;
      },
      async release(h) {
        await service.rpc("activation_release", { p_hash: h });
      },
      async complete(h, userId, alias) {
        const { error } = await service.rpc("activation_complete", { p_hash: h, p_user: userId, p_alias: alias });
        if (error) log.error("activation.complete_failed", { error });
        return { error: error ? error.message || "activation:generic" : null };
      },
      alias: generateInboundAlias,
    },
    hash,
    password,
  );

  if (!result.ok) {
    const key = result.code === "activation:email_exists" ? "activation.errors.email_exists" : activationErrorKey(result.code);
    return { errorKey: key };
  }
  log.info("activation.completed", { journey: result.journey });
  await clearApplicationCookie();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: result.email, password });
  redirect(error ? "/login?activated=1" : "/onboarding");
}

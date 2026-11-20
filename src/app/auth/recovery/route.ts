import { NextResponse } from "next/server";
import { FORGOT_PASSWORD_PATH, RESET_PASSWORD_PATH, recoveryProblem } from "@/lib/auth/recovery";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";

/**
 * Where an emailed recovery link lands. Accepts the two shapes Supabase can
 * send:
 *   - `?code=` (PKCE, the default email template), exchanged with the code
 *     verifier cookie set when the link was requested from this browser;
 *   - `?token_hash=&type=recovery` (the template recommended in the runbook),
 *     which works in any browser.
 * On success the browser holds a recovery-only session, which the proxy
 * confines to /reset-password. On any failure the person goes back to
 * /forgot-password with a reason; provider text is never shown. Redirects only
 * to fixed same-origin paths, never to a parameter.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const to = (path: string) => {
    const res = NextResponse.redirect(new URL(path, url.origin));
    res.headers.set("Referrer-Policy", "no-referrer");
    res.headers.set("Cache-Control", "no-store");
    return res;
  };
  const fail = (problem: string) => to(`${FORGOT_PASSWORD_PATH}?link=${problem}`);

  if (!isSupabaseConfigured()) return fail("invalid");
  const errorCode = url.searchParams.get("error_code");
  if (errorCode || url.searchParams.get("error")) return fail(recoveryProblem({ code: errorCode }));

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const supabase = await createClient();

  if (code && /^[A-Za-z0-9_-]{8,128}$/.test(code)) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      log.warn("password_reset.exchange_failed", { code: error.code ?? null, status: error.status ?? null });
      return fail(recoveryProblem(error));
    }
    return to(RESET_PASSWORD_PATH);
  }
  if (tokenHash && type === "recovery" && /^[A-Za-z0-9_-]{8,256}$/.test(tokenHash)) {
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (error) {
      log.warn("password_reset.verify_failed", { code: error.code ?? null, status: error.status ?? null });
      return fail(recoveryProblem(error));
    }
    return to(RESET_PASSWORD_PATH);
  }
  return fail("invalid");
}

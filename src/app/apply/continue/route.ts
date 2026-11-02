import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/rate-limit";
import { hashToken, isTokenShape } from "@/lib/verification/tokens";
import { setApplicationCookie } from "@/lib/verification/application";
import { clientKey } from "@/lib/client-key";

/**
 * The emailed "continue your application" link. Moves the token out of the
 * URL into an httpOnly cookie and redirects, so it does not stay in the
 * address bar, history or a Referer header. An invalid or expired token gets
 * the same neutral page as no token at all.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("token");
  const to = (path: string) => {
    const res = NextResponse.redirect(new URL(path, url.origin));
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  };
  if (!isTokenShape(raw)) return to("/apply?link=invalid");
  if (!(await consumeRateLimit("activation", await clientKey())).allowed) return to("/apply?link=rate_limited");
  const { data } = await createAdminClient().rpc("application_token_lookup", { p_hash: hashToken(raw), p_purpose: "resume" });
  const state = data?.[0]?.state;
  if (state !== "valid") return to(`/apply?link=${state === "expired" ? "expired" : "invalid"}`);
  await setApplicationCookie(raw);
  return to("/apply");
}

import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Email-address confirmation link (Supabase Auth, token-hash flow). On success
 * the person is signed in and lands on /verification; anything else goes to
 * /login with a neutral error. Only internal paths are ever redirected to.
 */
const TYPES: EmailOtpType[] = ["signup", "email", "email_change"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL("/verification", url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=confirmation", url.origin));
}

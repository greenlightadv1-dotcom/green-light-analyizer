import type { Metadata } from "next";
import Link from "next/link";
import { GetStartedShell } from "@/components/get-started/GetStartedShell";
import { ActivateForm } from "@/components/apply/ActivateForm";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { T } from "@/components/ui/T";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";
import { hashToken, isTokenShape } from "@/lib/verification/tokens";
import { activateAccount } from "./actions";

export const metadata: Metadata = { title: "Create your account", referrer: "no-referrer", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Public. Reading the page checks the token without spending it
 * (application_token_lookup); only submitting the form claims it. The
 * address is shown so the person knows which account they are creating.
 */
export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  let state: "valid" | "expired" | "used" | "revoked" | "invalid" = "invalid";
  let email: string | null = null;
  if (isTokenShape(token) && isSupabaseConfigured()) {
    const service = createAdminClient();
    const { data } = await service.rpc("application_token_lookup", { p_hash: hashToken(token), p_purpose: "activation" });
    const row = data?.[0];
    if (row) {
      state = row.state;
      if (row.state === "valid") {
        const { data: r } = await service.from("access_requests").select("email").eq("id", row.access_request_id).maybeSingle();
        email = r?.email ?? null;
      }
    }
  }
  return (
    <GetStartedShell>
      <section className="mx-auto max-w-xl space-y-4 px-4 pt-16 pb-20 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-fg"><T k="activation.title" /></h1>
        {state === "valid" && token ? (
          <ActivateForm token={token} email={email} action={activateAccount} />
        ) : (
          <GlassPanel className="space-y-3 p-6 text-sm text-fg">
            <p><T k={`activation.state.${state}`} /></p>
            <p className="text-xs text-fg-muted"><Link href="/login" className="underline"><T k="activation.signIn" /></Link></p>
          </GlassPanel>
        )}
      </section>
    </GetStartedShell>
  );
}

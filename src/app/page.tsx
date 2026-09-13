import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";
import { LandingView } from "@/components/landing/LandingView";

/**
 * Public marketing landing page — reachable without a session (proxy.ts /
 * session.ts treat "/" as a public path). There is still no self-signup
 * anywhere in the product (§4): the "Request Access" CTA routes to Discord,
 * same as every other plan/account-creation flow.
 *
 * A signed-in visitor never actually sees this component — the proxy's
 * route guard bounces them to /dashboard (or /set-password) before the
 * request reaches here.
 *
 * The exception is a deployment with no (or broken) Supabase configuration.
 * There, /dashboard cannot render at all — requireProfile() reaches for a
 * database it has no usable URL/key for — so this sends a visitor to the UI
 * preview instead, the only thing that deployment can usefully show (same
 * condition that enables those routes — see previewEnabled() in
 * app/preview/layout.tsx).
 */
export default function RootPage() {
  if (!isSupabaseConfigured()) redirect("/preview/dashboard");
  return <LandingView />;
}

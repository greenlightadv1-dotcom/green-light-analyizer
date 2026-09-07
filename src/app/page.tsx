import { redirect } from "next/navigation";

/**
 * There is no public marketing surface in the MVP and no self-signup (§4), so
 * the root just hands off to the guards in the proxy: signed out -> /login,
 * pending first-login reset -> /set-password, otherwise the dashboard.
 *
 * The exception is a deployment with no Supabase configuration. There,
 * /dashboard cannot render at all — requireProfile() reaches for a database
 * that has no URL — so the root would greet a visitor with a server error.
 * Sending them to the UI preview instead is the only thing that deployment can
 * usefully show, and it is the same condition that enables those routes.
 */
export default function RootPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) redirect("/preview/dashboard");
  redirect("/dashboard");
}

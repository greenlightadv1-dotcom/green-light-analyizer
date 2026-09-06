import { redirect } from "next/navigation";

/**
 * There is no public marketing surface in the MVP and no self-signup (§4), so
 * the root just hands off to the guards in middleware: signed out -> /login,
 * pending first-login reset -> /set-password, otherwise the dashboard.
 */
export default function RootPage() {
  redirect("/dashboard");
}

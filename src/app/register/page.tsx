import type { Metadata } from "next";
import { GetStartedShell } from "@/components/get-started/GetStartedShell";
import { RegisterForm } from "@/components/get-started/RegisterForm";
import { REGISTER_JOURNEYS, selfSignupEnabled, type RegisterJourney } from "@/lib/registration";

export const metadata: Metadata = { title: "Create your account" };

/** Public. Self-registration is off unless SELF_SIGNUP_ENABLED=1 (lib/registration.ts). */
export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const journey = (REGISTER_JOURNEYS as readonly string[]).includes(sp.journey ?? "") ? (sp.journey as RegisterJourney) : "creator";
  return (
    <GetStartedShell>
      <RegisterForm enabled={selfSignupEnabled()} initialJourney={journey} />
    </GetStartedShell>
  );
}

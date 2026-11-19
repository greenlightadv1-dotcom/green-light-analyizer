import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordLink, ResetDoneNotice } from "@/components/auth/LoginRecovery";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { AccessNote } from "./AccessNote";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const { next, reset } = await searchParams;

  return (
    <GlassPanel className="p-7 sm:p-8">
      <h1 className="text-2xl font-bold text-fg sm:text-3xl">Sign in</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        Your Personal Business Manager.
      </p>

      {reset === "done" ? <ResetDoneNotice /> : null}

      <LoginForm next={next} />
      <ForgotPasswordLink />

      {/*
        §4.1 — admin-gated: there is no self-signup anywhere in this product,
        so this panel offers a support route rather than a "create account"
        link. Payments are confirmed via Discord tickets (§4.3), not in-app
        billing.
      */}
      <AccessNote />

      <p className="mt-4 text-xs leading-relaxed text-fg-muted">
        Signing in means you accept our{" "}
        <Link href="/terms" className="text-accent underline underline-offset-2">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-accent underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>
    </GlassPanel>
  );
}

import type { Metadata } from "next";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <GlassPanel className="p-7 sm:p-8">
      <h1 className="text-xl font-semibold text-white">Sign in</h1>
      <p className="mt-1.5 text-sm text-white/55">
        Your Personal Business Manager.
      </p>

      <LoginForm next={next} />

      {/*
        §4.1 — admin-gated: there is no self-signup anywhere in this product,
        so this panel offers a support route rather than a "create account"
        link. Plans and payments are handled via Discord tickets (§4.3), not
        in-app billing.
      */}
      <p className="mt-7 border-t border-white/8 pt-5 text-xs leading-relaxed text-white/45">
        Green Light accounts are created by an administrator — there is no
        public sign-up. Need access, or a plan change? Open a ticket in our
        Discord support server.
      </p>
    </GlassPanel>
  );
}

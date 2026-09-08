import type { Metadata } from "next";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { SetPasswordForm } from "./SetPasswordForm";

export const metadata: Metadata = { title: "Set your password" };

/**
 * Reached only via the middleware guard. Nothing else in the product is
 * navigable while `must_change_password` is set (§4.2).
 */
export default function SetPasswordPage() {
  return (
    <GlassPanel className="p-7 sm:p-8">
      <h1 className="text-xl font-semibold text-fg">Set your password</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-fg/55">
        Your account was opened with a temporary password. Choose a permanent
        one to finish activating it — the rest of Green Light stays locked until
        you do.
      </p>

      <SetPasswordForm />
    </GlassPanel>
  );
}

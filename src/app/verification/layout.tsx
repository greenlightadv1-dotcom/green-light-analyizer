import type { ReactNode } from "react";
import { ThemedLogo } from "@/components/brand/ThemedLogo";
import { LanguageMenu } from "@/components/ui/LanguageMenu";
import { ThemeMenu } from "@/components/ui/ThemeMenu";
import { SignOutButton } from "@/components/verification/SignOutButton";

/**
 * Its own shell, outside (app): an account waiting for approval may reach
 * this page and nothing else (requireProfile redirects it here).
 */
export default function VerificationLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl p-4 lg:p-6">
      <header className="glass-panel-solid mb-5 flex items-center justify-between gap-3 px-4 py-2.5">
        <ThemedLogo size={30} />
        <div className="flex items-center gap-2">
          <LanguageMenu />
          <ThemeMenu />
          <SignOutButton />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

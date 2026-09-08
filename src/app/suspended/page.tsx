import type { Metadata } from "next";
import { ThemedLogo } from "@/components/brand/ThemedLogo";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { DISCORD_INVITE_URL } from "@/lib/constants/contact";

export const metadata: Metadata = { title: "Account suspended" };

/**
 * Terminal state for a banned account (§6, §12).
 *
 * Outside the (app) route group on purpose: that group's layout calls
 * requireProfile(), which is what redirects here, so rendering inside it would
 * loop. Deliberately gives no detail about what matched — a precise
 * explanation is a map for the next attempt.
 */
export default function SuspendedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <ThemedLogo height={44} />
        </div>

        <GlassPanel className="p-7 sm:p-8">
          <h1 className="text-xl font-semibold text-fg">
            This account is suspended
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-fg/55">
            Green Light closed this account for attempting to move a deal off
            the platform or exchange direct contact details, which the terms
            treat as a permanent breach.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-fg/45">
            If you believe this is a mistake, open a ticket in our{" "}
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-green underline underline-offset-2 hover:brightness-110"
            >
              Discord support server
            </a>{" "}
            and an administrator will review it.
          </p>

          <form action="/auth/signout" method="post" className="mt-6">
            <button
              type="submit"
              className="text-xs text-fg/40 underline underline-offset-4 transition hover:text-fg/70"
            >
              Sign out
            </button>
          </form>
        </GlassPanel>
      </div>
    </main>
  );
}

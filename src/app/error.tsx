"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ThemedLogo } from "@/components/brand/ThemedLogo";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { CopyButton } from "@/components/ui/CopyButton";
import { useTranslation } from "@/components/LocaleProvider";
import { DISCORD_INVITE_URL } from "@/lib/constants/contact";

/**
 * Route-level error boundary. Error boundaries must be Client Components.
 *
 * Note the prop is `retry`, not the `reset` of earlier Next.js majors.
 *
 * `error.digest` is the only thing tying what the user saw to what the server
 * logged — a server-side error's real message is deliberately withheld from
 * the client. So it is shown, and made copyable, rather than hidden: it is
 * what turns "it broke" into something support can actually look up.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    // Until an error reporting service is wired up, this is the only record on
    // the client side. Replace with that service's capture call — don't drop it.
    console.error("Unhandled route error", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <ThemedLogo size={48} />
        </div>

        <GlassPanel className="p-7 sm:p-8">
          <h1 className="text-xl font-semibold text-fg">{t("errors.errorTitle")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-fg/55">
            {t("errors.errorBody")}
          </p>

          {error.digest ? (
            <div className="mt-5">
              <p className="text-xs font-medium tracking-wide text-fg/70 uppercase">
                {t("errors.reference")}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 rounded-xl border border-fg/10 bg-navy-dark/70 px-3.5 py-2.5 font-mono text-sm break-all text-brand-green">
                  {error.digest}
                </code>
                <CopyButton value={error.digest} />
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-green px-5 text-sm font-semibold text-ink transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
            >
              {t("errors.tryAgain")}
            </button>
            <Link
              href="/"
              className="text-xs text-fg/45 underline underline-offset-4 transition hover:text-fg/80"
            >
              {t("errors.backHome")}
            </Link>
          </div>

          <p className="mt-6 border-t border-fg/8 pt-4 text-[11px] leading-relaxed text-fg/35">
            {t("errors.stillStuck")}{" "}
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-green underline underline-offset-2 hover:brightness-110"
            >
              {t("errors.discordSupport")}
            </a>
          </p>
        </GlassPanel>
      </div>
    </main>
  );
}

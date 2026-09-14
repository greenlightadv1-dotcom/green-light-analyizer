import Link from "next/link";
import type { ReactNode } from "react";
import { ThemedLogo } from "@/components/brand/ThemedLogo";
import { GlassPanel } from "@/components/ui/GlassPanel";
import {
  ENTITY_NAME,
  LEGAL_ENTITY_UNRESOLVED,
  LEGAL_LAST_UPDATED,
} from "@/lib/constants/legal";

/**
 * Shared shell for /terms and /privacy.
 *
 * Server components, deliberately: these are the two pages in the product a
 * crawler and a compliance reviewer must be able to read with no JavaScript
 * and no session. That also means no `t()` — see the note rendered at the
 * foot of every legal page for why these are English only.
 */
export function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
      <header className="mb-8">
        <Link href="/" className="inline-block">
          <ThemedLogo size={36} />
        </Link>

        <h1 className="mt-7 text-3xl font-semibold tracking-tight text-fg">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg/55">
          {summary}
        </p>
        <p className="mt-4 font-mono text-xs text-fg/40">
          Last updated {LEGAL_LAST_UPDATED}
        </p>
      </header>

      {LEGAL_ENTITY_UNRESOLVED ? (
        <div
          role="note"
          className="mb-8 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3.5 text-xs leading-relaxed text-amber-800 dark:text-amber-100"
        >
          <strong className="font-semibold">Draft — not yet in force.</strong>{" "}
          The operating entity, its registered address and the governing law are
          still marked <code className="font-mono">[LIKE THIS]</code> below.
          Until those are filled in and this document has been reviewed by a
          qualified lawyer, treat it as a statement of intended practice rather
          than a binding agreement.
        </div>
      ) : null}

      <GlassPanel className="p-6 sm:p-9">
        <article
          className="
            text-sm leading-relaxed text-fg/75
            [&_h2]:mt-9 [&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-fg
            [&>h2:first-child]:mt-0
            [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-fg
            [&_p]:mt-3
            [&_ul]:mt-3 [&_ul]:space-y-2 [&_ul]:ps-5 [&_ul]:list-disc
            [&_ol]:mt-3 [&_ol]:space-y-2 [&_ol]:ps-5 [&_ol]:list-decimal
            [&_li]:ps-1
            [&_strong]:font-semibold [&_strong]:text-fg
            [&_code]:rounded [&_code]:border [&_code]:border-fg/10 [&_code]:bg-fg/5
            [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs
            [&_a]:text-brand-green [&_a]:underline [&_a]:underline-offset-2
          "
        >
          {children}
        </article>
      </GlassPanel>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 text-xs text-fg/40">
        <div className="flex flex-wrap gap-4">
          <Link href="/terms" className="transition hover:text-fg/70">
            Terms of Service
          </Link>
          <Link href="/privacy" className="transition hover:text-fg/70">
            Privacy Policy
          </Link>
          <Link href="/" className="transition hover:text-fg/70">
            Home
          </Link>
        </div>
        <p>
          © {new Date().getFullYear()} {ENTITY_NAME}
        </p>
      </footer>

      <p className="mt-6 text-[11px] leading-relaxed text-fg/30">
        This document is published in English only. Green Light&apos;s interface
        is available in five languages, but the legal documents are not
        translated: a mistranslated term of art changes what the parties agreed
        to, so the English text is the single authoritative version.
      </p>
    </div>
  );
}

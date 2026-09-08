import { CtaLink } from "@/components/landing/CtaLink";
import { DISCORD_INVITE_URL } from "@/lib/constants/contact";

/**
 * Ambient glow mesh scoped to the hero (spec point 3) — separate from the
 * global GlowOrbs (ui/GlowOrbs.tsx), which are tuned for the always-dark
 * authenticated app and would sit hidden behind this page's opaque
 * background anyway. Static rather than animated: this section doesn't need
 * its own motion budget on top of the page-entrance transition.
 */
function HeroGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-32 left-1/2 h-[520px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(98,232,35,0.20)_0%,transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(98,232,35,0.28)_0%,transparent_70%)]" />
      <div className="absolute top-40 -right-40 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(41,62,97,0.16)_0%,transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(41,62,97,0.6)_0%,transparent_70%)]" />
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-28 sm:pb-24">
      <HeroGlow />

      <p className="mx-auto inline-flex items-center rounded-full border border-navy/15 bg-navy/5 px-3 py-1 text-xs font-medium tracking-wide text-navy uppercase dark:border-brand-green/25 dark:bg-brand-green/10 dark:text-brand-green">
        Admin-gated sponsorship marketplace
      </p>

      <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight text-ink sm:text-5xl md:text-6xl dark:text-white">
        Your Personal Business Manager
      </h1>

      <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink/60 sm:text-lg dark:text-white/60">
        Verified creator stats, masked negotiations, and an AI co-pilot that
        prices every offer — no screenshots, no leaked contact info, no deal
        that skips the platform.
      </p>

      <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <CtaLink href={DISCORD_INVITE_URL} external variant="primary" className="w-full sm:w-auto">
          Request access
        </CtaLink>
        <CtaLink href="/login" variant="ghost" className="w-full sm:w-auto">
          Sign in
        </CtaLink>
      </div>

      <p className="mt-4 text-xs text-ink/40 dark:text-white/35">
        Accounts are created by an admin — no public sign-up.
      </p>
    </section>
  );
}

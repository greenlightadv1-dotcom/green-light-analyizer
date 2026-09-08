import { PageTransition } from "@/components/ui/PageTransition";
import { LandingNav } from "@/components/landing/LandingNav";
import { Hero } from "@/components/landing/Hero";
import { ValueProps } from "@/components/landing/ValueProps";
import { ContactFooter } from "@/components/landing/ContactFooter";

/**
 * Public marketing landing page (src/app/page.tsx). Opaque bg-white/dark:bg-obsidian
 * at the top level so it fully overrides the app shell's hardcoded dark
 * `body` background regardless of theme — see globals.css's comment on
 * @custom-variant dark for why only this page uses `dark:` utilities at all.
 */
export function LandingView() {
  return (
    <div className="min-h-screen bg-white text-ink dark:bg-obsidian dark:text-white">
      <PageTransition>
        <LandingNav />
        <main>
          <Hero />
          <ValueProps />
        </main>
        <ContactFooter />
      </PageTransition>
    </div>
  );
}

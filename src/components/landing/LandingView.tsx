import { PageTransition } from "@/components/ui/PageTransition";
import { LandingNav } from "@/components/landing/LandingNav";
import { Hero } from "@/components/landing/Hero";
import { ValueProps } from "@/components/landing/ValueProps";
import { ContactFooter } from "@/components/landing/ContactFooter";

/**
 * Public marketing landing page (src/app/page.tsx). No bg/text classes of
 * its own — `body` in globals.css is theme-aware now (mesh gradient +
 * --color-fg), same as the rest of the app, so this just needs the layout.
 */
export function LandingView() {
  return (
    <div className="min-h-screen">
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

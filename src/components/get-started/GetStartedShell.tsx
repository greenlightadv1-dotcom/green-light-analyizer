import type { ReactNode } from "react";
import { ContactFooter } from "@/components/landing/ContactFooter";
import { LandingNav } from "@/components/landing/LandingNav";
import { PageTransition } from "@/components/ui/PageTransition";

export function GetStartedShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <PageTransition>
        <LandingNav />
        <main>{children}</main>
        <ContactFooter />
      </PageTransition>
    </div>
  );
}

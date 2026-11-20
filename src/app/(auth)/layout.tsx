import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ThemedLogo } from "@/components/brand/ThemedLogo";
import { PageTransition } from "@/components/ui/PageTransition";
import { T } from "@/components/ui/T";

/**
 * Shared shell for the unauthenticated surfaces (sign in, forgot/reset
 * password, forced first-login reset). On large screens a deep-forest brand
 * panel sits beside the form; on phones only the form shows.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 p-4 sm:p-6 lg:grid-cols-2 lg:p-8">
      <aside className="surface-forest hidden flex-col justify-between p-10 lg:flex">
        <Link href="/" aria-label="Green Light home" className="w-fit rounded-full focus-visible:focus-ring">
          <Logo variant="dark" size={44} priority />
        </Link>
        <div>
          <p className="text-5xl leading-[1.05] font-bold text-white">
            <T k="landing.headline" />
          </p>
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/70">
            <T k="landing.noSignupNote" />
          </p>
        </div>
        <span aria-hidden className="h-1.5 w-16 rounded-full bg-brand-green" />
      </aside>

      <div className="flex items-center justify-center py-8">
        <PageTransition>
          <div className="w-full max-w-md">
            <div className="mb-8 flex justify-center lg:hidden">
              <ThemedLogo size={48} />
            </div>
            {children}
          </div>
        </PageTransition>
      </div>
    </main>
  );
}

import { Logo } from "@/components/brand/Logo";
import { PageTransition } from "@/components/ui/PageTransition";

/** Shared shell for the unauthenticated surfaces: login and forced reset. */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <PageTransition>
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center">
            {/* Dark theme is the app default -> dark lockup (§2.3). */}
            <Logo variant="dark" height={44} priority />
          </div>
          {children}
        </div>
      </PageTransition>
    </main>
  );
}

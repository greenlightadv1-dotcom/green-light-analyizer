import { ThemedLogo } from "@/components/brand/ThemedLogo";
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
            <ThemedLogo height={44} />
          </div>
          {children}
        </div>
      </PageTransition>
    </main>
  );
}

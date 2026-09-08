import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { ExpiryWarningBanner } from "@/components/dashboard/ExpiryWarningBanner";
import { PageTransition } from "@/components/ui/PageTransition";
import { requireProfile } from "@/lib/auth";

/**
 * Authenticated app shell. The middleware guards the route group already; the
 * `requireProfile()` call re-checks server-side on every render (§4, §12).
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="mx-auto flex w-full max-w-[1680px] gap-5 p-4 lg:gap-6 lg:p-6 2xl:p-8">
      <Sidebar role={profile.role} />
      <div className="min-w-0 flex-1">
        <TopBar profile={profile} />
        <ExpiryWarningBanner profile={profile} />
        <PageTransition>{children}</PageTransition>
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { PageTransition } from "@/components/ui/PageTransition";
import { mockProfile } from "@/lib/preview/mock";

/**
 * UI preview shell — CLAUDE.md has no section for this; it exists so the
 * interface can be reviewed in a browser before the real keys are wired up.
 *
 * Deliberately NOT inside the (app) route group. That group's layout calls
 * requireProfile(), and the correct way to preview a gated app is to render
 * the same components outside the gate — never to add a bypass inside it. No
 * code path here can reach the real one, and the admin gate is untouched.
 *
 * Nothing here reads the database or any environment variable, which is what
 * lets it deploy with no configuration at all.
 *
 * Availability is self-limiting: these routes exist only while the app has no
 * Supabase configuration — that is, only while the real product cannot run
 * anyway. The moment NEXT_PUBLIC_SUPABASE_URL is set, every route here starts
 * returning 404 with nothing to remember to delete. NEXT_PUBLIC_ENABLE_UI_PREVIEW=1
 * forces them on alongside a configured app, for reviewing the UI on staging.
 */
function previewEnabled() {
  if (process.env.NEXT_PUBLIC_ENABLE_UI_PREVIEW === "1") return true;
  return !process.env.NEXT_PUBLIC_SUPABASE_URL;
}
export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!previewEnabled()) notFound();

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-6 p-4">
      <Sidebar role={mockProfile.role} basePath="/preview" />
      <div className="min-w-0 flex-1">
        <div className="mb-4 rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-2.5 text-xs leading-relaxed text-amber-100">
          <strong className="font-semibold">Interface preview.</strong> Every
          name, figure and message on these screens is invented, and nothing is
          saved. The real product is admin-gated and holds no data yet.
        </div>

        <TopBar profile={mockProfile} demo />
        <PageTransition>{children}</PageTransition>
      </div>
    </div>
  );
}

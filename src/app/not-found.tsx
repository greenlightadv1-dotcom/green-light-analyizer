import type { Metadata } from "next";
import { NotFoundCard } from "@/components/errors/NotFoundCard";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Rendered for unmatched URLs and for every `notFound()` call that has no
 * closer boundary — a deal room that isn't yours, a `/p/<slug>` profile that
 * doesn't exist, the preview routes once Supabase is configured.
 *
 * Sits at the app root, so it renders inside the root layout (theme, locale
 * and the ambient glow orbs) but outside the authenticated shell — a 404 keeps
 * the brand without implying the sidebar's navigation is still valid.
 */
export default function NotFound() {
  return <NotFoundCard />;
}

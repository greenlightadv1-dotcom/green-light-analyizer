import type { Metadata } from "next";
import { MediaKitView } from "@/components/views/MediaKitView";
import { mockKits, mockProfile } from "@/lib/preview/mock";

export const metadata: Metadata = { title: "Media kit · Preview" };

/**
 * Unlike the other preview routes, this one can reach the model.
 *
 * `preview/analyzer` and `preview/inbox/[chatId]` pass `demo` to their views,
 * which makes their AI controls inert. `MediaKitView` accepts no such flag, so
 * the niche detector it renders is bound to the live `detectNiche` server
 * action — and a server action runs inside this segment's function. Without
 * this export the segment runs on Vercel's default timeout, under the AI
 * budget, and the request dies with no fallback and no log: the exact failure
 * the four (app) segments declare this to prevent.
 */
export const maxDuration = 60;

export default function PreviewMediaKit() {
  return (
    <MediaKitView
      profile={mockProfile}
      kits={mockKits}
      plan={mockProfile.subscription_plan ?? "Starter"}
    />
  );
}

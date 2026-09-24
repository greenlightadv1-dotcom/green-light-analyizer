import type { Metadata } from "next";
import { AnalyzerView } from "@/components/views/AnalyzerView";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Manual analyzer" };
/**
 * Server actions run inside this route segment's function, and the ones
 * reachable from this page call the model (src/lib/ai/chat.ts), which budgets
 * up to 50s across its attempts. Without this the segment runs on Vercel's
 * default timeout — well under that — so the platform killed the request
 * before the AI budget was anywhere near spent, and the creator got a dead
 * page rather than the rule-based fallback. 60s is the Hobby ceiling.
 */
export const maxDuration = 60;


/**
 * Manual Analyzer — CLAUDE.md §5.1. The quick path for an offer that did not
 * arrive through the inbound alias.
 */
export default async function AnalyzerPage() {
  const profile = await requireProfile();

  const supabase = await createClient();
  const { data: kits } = await supabase
    .from("media_kits")
    .select("platform, avg_views, engagement_rate, content_category, audience_verified")
    .eq("creator_id", profile.id)
    .order("avg_views", { ascending: false })
    .limit(1);

  return <AnalyzerView kit={kits?.[0] ?? null} />;
}

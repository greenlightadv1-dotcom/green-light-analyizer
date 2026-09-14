import type { Metadata } from "next";
import { AnalyzerView } from "@/components/views/AnalyzerView";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Manual analyzer" };

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

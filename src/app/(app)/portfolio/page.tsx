import type { Metadata } from "next";
import { PortfolioView } from "@/components/portfolio/PortfolioView";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_VISIBILITY, VISIBILITY_FIELDS } from "@/lib/portfolio/rules";

export const metadata: Metadata = { title: "Portfolio" };

/** A creator's own portfolio and public-profile sections, read under RLS. */
export default async function PortfolioPage() {
  const profile = await requireRole("creator");
  const supabase = await createClient();
  const [{ data: items }, { data: settings }] = await Promise.all([
    supabase.from("portfolio_items").select("*").eq("creator_id", profile.id).order("sort_order").order("created_at"),
    supabase.from("public_profile_settings").select("*").eq("profile_id", profile.id).maybeSingle(),
  ]);
  const visibility = Object.fromEntries(
    VISIBILITY_FIELDS.map((k) => [k, settings ? settings[k] : DEFAULT_VISIBILITY[k]]),
  ) as typeof DEFAULT_VISIBILITY;
  return (
    <PortfolioView
      items={items ?? []}
      visibility={visibility}
      publicPath={profile.shareable_slug ? `/p/${profile.shareable_slug}` : null}
    />
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingView } from "@/components/views/OnboardingView";
import { requireProfile } from "@/lib/auth";
import { listMediaKits } from "@/lib/media-kit/queries";
import { companyOnboarding, creatorOnboarding, type OnboardingFacts } from "@/lib/onboarding";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Get set up" };

/**
 * Onboarding (feature 2): the checklist for the signed-in account, computed
 * from its real data. Creators and companies only; admins have nothing to set
 * up here.
 */
export default async function OnboardingPage() {
  const profile = await requireProfile();
  if (profile.role === "admin") redirect("/dashboard");

  const supabase = await createClient();
  const facts: OnboardingFacts = { kitCount: 0, analyticsConnected: false, emailDealSeen: false, representsCompany: null };

  if (profile.role === "creator") {
    const kits = await listMediaKits(profile.id);
    facts.kitCount = kits.length;
    facts.analyticsConnected = kits.some((k) => k.analytics_oauth_connected);
    const { data } = await supabase
      .from("deal_chats")
      .select("id")
      .eq("creator_id", profile.id)
      .is("company_id", null)
      .limit(1);
    facts.emailDealSeen = (data ?? []).length > 0;
  } else {
    // The caller's own membership row (RLS: member_id = auth.uid()). The
    // company's display name is read with the service role for that one id.
    const { data: link } = await supabase
      .from("company_members")
      .select("company_id, member_role")
      .eq("member_id", profile.id)
      .maybeSingle();
    if (link && link.member_role === "representative") {
      const { data: company } = await createAdminClient()
        .from("profiles")
        .select("full_name")
        .eq("id", link.company_id)
        .maybeSingle();
      facts.representsCompany = company?.full_name ?? null;
    }
  }

  const onboarding = profile.role === "creator" ? creatorOnboarding(profile, facts) : companyOnboarding(profile, facts);

  return (
    <OnboardingView
      role={profile.role}
      onboarding={onboarding}
      avatarUrl={profile.avatar_url}
      classification={{
        categories: profile.creator_categories ?? [],
        games: profile.creator_games ?? [],
        formats: profile.content_formats ?? [],
      }}
      company={{
        full_name: profile.full_name,
        bio: profile.bio,
        company_website: profile.company_website ?? null,
        company_industry: profile.company_industry ?? null,
      }}
      representsCompany={facts.representsCompany}
    />
  );
}

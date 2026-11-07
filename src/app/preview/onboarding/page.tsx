import type { Metadata } from "next";
import { OnboardingView } from "@/components/views/OnboardingView";
import { creatorOnboarding } from "@/lib/onboarding";
import { mockKits, mockProfile } from "@/lib/preview/mock";

export const metadata: Metadata = { title: "Get set up · Preview" };

/** Preview: invented data, uploads and saves inert (demo). */
export default function PreviewOnboarding() {
  const onboarding = creatorOnboarding(mockProfile, {
    kitCount: mockKits.length,
    analyticsConnected: mockKits.some((k) => k.analytics_oauth_connected),
    emailDealSeen: true,
    representsCompany: null,
  });
  return (
    <OnboardingView
      role="creator"
      onboarding={onboarding}
      avatarUrl={mockProfile.avatar_url}
      classification={{
        categories: mockProfile.creator_categories ?? [],
        games: mockProfile.creator_games ?? [],
        formats: mockProfile.content_formats ?? [],
      }}
      company={{ full_name: mockProfile.full_name, bio: mockProfile.bio, company_website: null, company_industry: null }}
      representsCompany={null}
      demo
      basePath="/preview"
    />
  );
}

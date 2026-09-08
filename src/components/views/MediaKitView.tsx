import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { CountryShareList } from "@/components/media-kit/CountryShareList";
import { PlatformCard } from "@/components/media-kit/PlatformCard";
import { VerificationPanel } from "@/components/media-kit/VerificationPanel";
import { YoutubeSyncPanel } from "@/components/media-kit/YoutubeSyncPanel";
import { OAuthPlaceholderCard } from "@/components/media-kit/OAuthPlaceholderCard";
import { Alert } from "@/components/ui/Alert";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { kitByPlatform, type MediaKit } from "@/lib/media-kit/queries";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  canVerifyAudience,
  canAddConnection,
  maxConnections,
} from "@/lib/media-kit/platforms";
import type { CountryShare, Platform, SubscriptionPlan } from "@/lib/types/database";

const REAL_OAUTH_PLATFORMS: Platform[] = ["youtube", "instagram"];

/** Media kit (§7), presentation only. Shared with /preview. */
export function MediaKitView({
  kits,
  plan,
  oauthConfigured = {},
  oauthConnected = null,
  oauthError = null,
}: {
  kits: MediaKit[];
  plan: SubscriptionPlan;
  /** Whether each real-OAuth platform's app is actually registered. */
  oauthConfigured?: Partial<Record<Platform, boolean>>;
  /** Set right after a successful /api/oauth/[platform]/callback redirect. */
  oauthConnected?: string | null;
  oauthError?: string | null;
}) {
  const byPlatform = kitByPlatform(kits);
  const limit = maxConnections(plan);
  const verifiedCount = kits.filter((k) => k.audience_verified).length;

  return (
    <>
      <SectionHeader
        title="Media kit"
        description="What sponsors see about your reach. Stats come from platform APIs or carry a self-reported tag — never a screenshot."
      />

      {oauthConnected ? (
        <div className="mb-4">
          <Alert tone="info">
            {PLATFORM_LABELS[oauthConnected as Platform] ?? oauthConnected}{" "}
            connected — verified audience geography will sync below.
          </Alert>
        </div>
      ) : null}
      {oauthError ? (
        <div className="mb-4">
          <Alert>
            Couldn&apos;t connect{" "}
            {PLATFORM_LABELS[oauthError as Platform] ?? oauthError}. Try
            again, or check that the connection hasn&apos;t already expired.
          </Alert>
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <GlassPanel className="p-5">
          <p className="text-xs tracking-wide text-white/45 uppercase">
            Platforms
          </p>
          <p className="mt-1.5 text-lg font-semibold text-white tabular-nums">
            {kits.length} <span className="text-sm text-white/35">/ {limit}</span>
          </p>
          <p className="mt-2 text-xs text-white/40">
            {plan} plan.{" "}
            {canAddConnection(plan, kits.length)
              ? "You can connect more."
              : "Upgrade over Discord for more."}
          </p>
        </GlassPanel>

        <GlassPanel className="p-5">
          <p className="text-xs tracking-wide text-white/45 uppercase">
            Verified audiences
          </p>
          <p className="mt-1.5 text-lg font-semibold text-white tabular-nums">
            {verifiedCount}
          </p>
          <p className="mt-2 text-xs text-white/40">
            {canVerifyAudience(plan)
              ? "Verified geography is included on your plan."
              : "Verified geography is a Pro and Elite feature."}
          </p>
        </GlassPanel>

        <GlassPanel className="p-5">
          <p className="text-xs tracking-wide text-white/45 uppercase">
            Pricing impact
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/60">
            {verifiedCount > 0
              ? "Verified data is priced with full confidence."
              : "Without verified geography, a high-value deal can't be rated green."}
          </p>
        </GlassPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {PLATFORMS.map((platform) => {
          const kit = byPlatform.get(platform) ?? null;
          const isNew = !kit;
          const blocked = isNew && !canAddConnection(plan, kits.length);

          return (
            <div key={platform} className="space-y-3">
              <PlatformCard
                platform={platform}
                kit={kit}
                locked={blocked}
                lockReason={`Your ${plan} plan covers ${limit} platform connections and you have used them all. Upgrade over Discord to add ${PLATFORM_LABELS[platform]}.`}
                verifiedGeoConnected={
                  REAL_OAUTH_PLATFORMS.includes(platform) &&
                  kit?.audience_verified === true
                }
              />

              {kit ? (
                <GlassPanel className="space-y-4 p-5">
                  {/*
                    §7.2: the verified column is shown when it exists, the
                    declared one otherwise, and each is labelled. Falling back
                    silently would present self-reported data in the position a
                    sponsor reads as verified.
                  */}
                  <CountryShareList
                    shares={
                      (kit.audience_verified
                        ? (kit.verified_top_countries as CountryShare[] | null)
                        : (kit.declared_top_countries as CountryShare[] | null)) ??
                      null
                    }
                    verified={kit.audience_verified === true}
                    emptyHint="No audience geography yet. Add it above so offers can be priced against what a sponsor is targeting."
                  />

                  <VerificationPanel
                    platform={platform}
                    plan={plan}
                    connected={kit.analytics_oauth_connected === true}
                    configured={oauthConfigured[platform] === true}
                  />

                  {platform === "youtube" ? (
                    <YoutubeSyncPanel kit={kit} />
                  ) : null}
                </GlassPanel>
              ) : null}
            </div>
          );
        })}
      </div>

      {/*
        §7.3 lists TikTok in the verification matrix as declared-only, but the
        §10 platform CHECK constraint does not include it, so it cannot be
        stored. Flagged rather than silently widened — adding a platform is a
        product decision.
      */}
      <p className="mt-6 text-xs leading-relaxed text-white/30">
        TikTok is not listed here: the schema&apos;s platform set covers YouTube,
        Twitch, Kick and Instagram only.
      </p>

      <div className="mt-4">
        <OAuthPlaceholderCard />
      </div>
    </>
  );
}

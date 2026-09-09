"use client";

import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { CountryShareList } from "@/components/media-kit/CountryShareList";
import { CreatorProfileCard } from "@/components/media-kit/CreatorProfileCard";
import { PlatformCard } from "@/components/media-kit/PlatformCard";
import { ShareableLinkCard } from "@/components/media-kit/ShareableLinkCard";
import { VerificationPanel } from "@/components/media-kit/VerificationPanel";
import { YoutubeSyncPanel } from "@/components/media-kit/YoutubeSyncPanel";
import { InstagramSyncPanel } from "@/components/media-kit/InstagramSyncPanel";
import { OAuthPlaceholderCard } from "@/components/media-kit/OAuthPlaceholderCard";
import { Alert } from "@/components/ui/Alert";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import { kitByPlatform, type MediaKit } from "@/lib/media-kit/helpers";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  canVerifyAudience,
  canAddConnection,
  maxConnections,
} from "@/lib/media-kit/platforms";
import type { Profile } from "@/lib/auth";
import type { CountryShare, Platform, SubscriptionPlan } from "@/lib/types/database";

const REAL_OAUTH_PLATFORMS: Platform[] = ["youtube", "instagram"];

/** Media kit (§7), presentation only. Shared with /preview. */
export function MediaKitView({
  profile,
  kits,
  plan,
  oauthConfigured = {},
  oauthConnected = null,
  oauthError = null,
}: {
  profile: Profile;
  kits: MediaKit[];
  plan: SubscriptionPlan;
  /** Whether each real-OAuth platform's app is actually registered. */
  oauthConfigured?: Partial<Record<Platform, boolean>>;
  /** Set right after a successful /api/oauth/[platform]/callback redirect. */
  oauthConnected?: string | null;
  oauthError?: string | null;
}) {
  const { t } = useTranslation();
  const byPlatform = kitByPlatform(kits);
  const limit = maxConnections(plan);
  const verifiedCount = kits.filter((k) => k.audience_verified).length;

  return (
    <>
      <SectionHeader
        title={t("mediaKit.title")}
        description={t("mediaKit.description")}
      />

      {oauthConnected ? (
        <div className="mb-4">
          <Alert tone="info">
            {t("mediaKit.connectedNote", {
              platform: PLATFORM_LABELS[oauthConnected as Platform] ?? oauthConnected,
            })}
          </Alert>
        </div>
      ) : null}
      {oauthError ? (
        <div className="mb-4">
          <Alert>
            {t("mediaKit.connectFailedNote", {
              platform: PLATFORM_LABELS[oauthError as Platform] ?? oauthError,
            })}
          </Alert>
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CreatorProfileCard profile={profile} />
        </div>
        <ShareableLinkCard slug={profile.shareable_slug} />
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <GlassPanel className="p-5">
          <p className="text-xs tracking-wide text-fg/45 uppercase">
            {t("mediaKit.platforms")}
          </p>
          <p className="mt-1.5 text-lg font-semibold text-fg tabular-nums">
            {kits.length} <span className="text-sm text-fg/35">/ {limit}</span>
          </p>
          <p className="mt-2 text-xs text-fg/40">
            {t("mediaKit.planLabel", { plan })}{" "}
            {canAddConnection(plan, kits.length)
              ? t("mediaKit.canConnectMore")
              : t("mediaKit.upgradeForMore")}
          </p>
        </GlassPanel>

        <GlassPanel className="p-5">
          <p className="text-xs tracking-wide text-fg/45 uppercase">
            {t("mediaKit.verifiedAudiences")}
          </p>
          <p className="mt-1.5 text-lg font-semibold text-fg tabular-nums">
            {verifiedCount}
          </p>
          <p className="mt-2 text-xs text-fg/40">
            {canVerifyAudience(plan)
              ? t("mediaKit.verifiedIncluded")
              : t("mediaKit.verifiedProFeature")}
          </p>
        </GlassPanel>

        <GlassPanel className="p-5">
          <p className="text-xs tracking-wide text-fg/45 uppercase">
            {t("mediaKit.pricingImpact")}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-fg/60">
            {verifiedCount > 0
              ? t("mediaKit.pricingImpactVerified")
              : t("mediaKit.pricingImpactUnverified")}
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
                lockReason={t("mediaKit.lockReason", {
                  plan,
                  limit,
                  platform: PLATFORM_LABELS[platform],
                })}
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
                    emptyHint={t("mediaKit.noAudienceGeoYet")}
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

                  {platform === "instagram" &&
                  kit.analytics_oauth_connected === true ? (
                    <InstagramSyncPanel kit={kit} />
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
      <p className="mt-6 text-xs leading-relaxed text-fg/30">
        {t("mediaKit.tiktokNote")}
      </p>

      <div className="mt-4">
        <OAuthPlaceholderCard />
      </div>
    </>
  );
}

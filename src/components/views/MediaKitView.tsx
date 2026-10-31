"use client";

import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { CountryShareList } from "@/components/media-kit/CountryShareList";
import { CreatorProfileCard } from "@/components/media-kit/CreatorProfileCard";
import { ClassificationForm } from "@/components/onboarding/ClassificationForm";
import { DocumentsUpload } from "@/components/uploads/DocumentsUpload";
import { PlatformCard } from "@/components/media-kit/PlatformCard";
import { ShareableLinkCard } from "@/components/media-kit/ShareableLinkCard";
import { VerificationPanel } from "@/components/media-kit/VerificationPanel";
import { YoutubeSyncPanel } from "@/components/media-kit/YoutubeSyncPanel";
import { InstagramSyncPanel } from "@/components/media-kit/InstagramSyncPanel";
import { OAuthPlaceholderCard } from "@/components/media-kit/OAuthPlaceholderCard";
import { Alert } from "@/components/ui/Alert";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import { isRealOAuthPlatform } from "@/lib/oauth/platforms";
import { kitByPlatform, type MediaKit } from "@/lib/media-kit/helpers";
import {
  MAX_CONNECTIONS,
  PLATFORMS,
  PLATFORM_LABELS,
  canAddConnection,
} from "@/lib/media-kit/platforms";
import type { Profile } from "@/lib/auth";
import type { CountryShare, Platform } from "@/lib/types/database";
import { isVerifiedGeoFresh } from "@/lib/oauth/youtube-freshness";

/** Media kit (§7), presentation only. Shared with /preview. */
export function MediaKitView({
  profile,
  kits,
  oauthConnected = null,
  oauthError = null,
  demo = false,
}: {
  profile: Profile;
  kits: MediaKit[];
  /** Preview: the classification form and document upload are inert. */
  demo?: boolean;
  /** Set right after a successful /api/oauth/[platform]/callback redirect. */
  oauthConnected?: string | null;
  oauthError?: string | null;
}) {
  const { t } = useTranslation();
  const byPlatform = kitByPlatform(kits);
  const limit = MAX_CONNECTIONS;
  const verifiedCount = kits.filter((k) => isVerifiedGeoFresh(k)).length;

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

      {/* Feature 3: the controlled classification Discovery and G filter on. */}
      <GlassPanel as="section" className="mb-4 p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-fg">{t("onboarding.step.classification.title")}</h2>
        <p className="mt-1 mb-4 text-sm text-fg/60">{t("onboarding.step.classification.body")}</p>
        <ClassificationForm
          demo={demo}
          initial={{
            categories: profile.creator_categories ?? [],
            games: profile.creator_games ?? [],
            formats: profile.content_formats ?? [],
          }}
        />
        <details className="mt-6 border-t border-fg/10 pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-fg">{t("onboarding.documentsTitle")}</summary>
          <p className="mt-1 mb-4 text-sm text-fg/60">{t("onboarding.documentsBody")}</p>
          <DocumentsUpload demo={demo} />
        </details>
      </GlassPanel>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <GlassPanel className="p-5">
          <p className="text-xs tracking-wide text-fg/45 uppercase">
            {t("mediaKit.platforms")}
          </p>
          <p className="mt-1.5 text-lg font-semibold text-fg tabular-nums">
            {kits.length} <span className="text-sm text-fg/35">/ {limit}</span>
          </p>
          <p className="mt-2 text-xs text-fg/40">
            {t("mediaKit.planLabel")}{" "}
            {canAddConnection(kits.length)
              ? t("mediaKit.canConnectMore")
              : t("mediaKit.allConnectionsUsed")}
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
            {t("mediaKit.verifiedIncluded")}
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
          const blocked = isNew && !canAddConnection(kits.length);

          return (
            <div key={platform} className="space-y-3">
              <PlatformCard
                platform={platform}
                kit={kit}
                locked={blocked}
                lockReason={t("mediaKit.lockReason", {
                  limit,
                  platform: PLATFORM_LABELS[platform],
                })}
                verifiedGeoConnected={
                  isRealOAuthPlatform(platform) && isVerifiedGeoFresh(kit)
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
                      (isVerifiedGeoFresh(kit)
                        ? (kit.verified_top_countries as CountryShare[] | null)
                        : (kit.declared_top_countries as CountryShare[] | null)) ??
                      null
                    }
                    // Older than 30 days is not shown as verified (G1).
                    verified={isVerifiedGeoFresh(kit)}
                    emptyHint={t("mediaKit.noAudienceGeoYet")}
                  />

                  <VerificationPanel
                    platform={platform}
                    connected={kit.analytics_oauth_connected === true}
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

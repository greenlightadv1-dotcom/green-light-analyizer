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
import { ContentPerformancePanel } from "@/components/media-kit/ContentPerformancePanel";
import type { KitVideo } from "@/lib/media-kit/queries";
import type { MediaKitSnapshot } from "@/lib/types/database";
import { InstagramSyncPanel } from "@/components/media-kit/InstagramSyncPanel";
import { ConnectAccountPanel } from "@/components/media-kit/ConnectAccountPanel";
import { Alert } from "@/components/ui/Alert";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import { isRealOAuthPlatform } from "@/lib/oauth/platforms";
import { kitByPlatform, type MediaKit } from "@/lib/media-kit/helpers";
import {
  MAX_CONNECTIONS,
  PLATFORMS,
  PLATFORM_LABELS,
  accountConnectAvailable,
  canAddConnection,
} from "@/lib/media-kit/platforms";
import type { Profile } from "@/lib/auth";
import type { CountryShare, Platform } from "@/lib/types/database";
import { isVerifiedGeoFresh } from "@/lib/oauth/youtube-freshness";

/** Media kit (§7), presentation only. Shared with /preview. */
export function MediaKitView({
  profile,
  kits,
  snapshots = [],
  videos = [],
  oauthConnected = null,
  oauthError = null,
  accountConnected = null,
  connectError = null,
  demo = false,
}: {
  profile: Profile;
  kits: MediaKit[];
  /** The creator's own growth snapshots (0025); empty means no growth to show. */
  snapshots?: MediaKitSnapshot[];
  /** Recent YouTube uploads from the last sync (0035). */
  videos?: KitVideo[];
  /** Preview: the classification form and document upload are inert. */
  demo?: boolean;
  /** Set right after a successful /api/oauth/[platform]/callback redirect. */
  oauthConnected?: string | null;
  oauthError?: string | null;
  /** Set after /api/connect/[platform]/callback (0042): a platform, or "platform:reason". */
  accountConnected?: string | null;
  connectError?: string | null;
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

      {accountConnected && PLATFORMS.includes(accountConnected as Platform) ? (
        <div className="mb-4">
          <Alert tone="info">
            {t("mediaKit.connect.connectedBanner", { platform: PLATFORM_LABELS[accountConnected as Platform] })}
          </Alert>
        </div>
      ) : null}
      {connectError ? <ConnectErrorBanner value={connectError} /> : null}

      {/* The link card is empty until the profile is saved, so it only takes
          space once there is a link to share. */}
      {profile.shareable_slug ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <CreatorProfileCard profile={profile} />
          </div>
          <ShareableLinkCard slug={profile.shareable_slug} />
        </div>
      ) : (
        <div className="mb-4">
          <CreatorProfileCard profile={profile} />
        </div>
      )}

      {/* Feature 3: the controlled classification Discovery and G filter on. */}
      {/* Collapsed: set once in Get set up, edited here only when needed. */}
      <GlassPanel as="details" className="group mb-4 p-5 sm:p-6">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-base font-semibold text-fg">{t("onboarding.step.classification.title")}</span>
            <span className="mt-1 block text-sm text-fg/60">{t("onboarding.step.classification.body")}</span>
          </span>
          <span aria-hidden className="mt-0.5 text-lg leading-none text-fg-muted transition-transform group-open:rotate-90 rtl:-scale-x-100">›</span>
        </summary>
        <div className="mt-4" />
        <ClassificationForm
          demo={demo}
          initial={{
            categories: profile.creator_categories ?? [],
            games: profile.creator_games ?? [],
            tags: profile.creator_tags ?? [],
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
          <p className="text-sm font-medium text-fg-muted">
            {t("mediaKit.platforms")}
          </p>
          <p className="mt-1.5 text-lg font-semibold text-fg tabular-nums">
            {kits.length} <span className="text-sm text-fg-muted">/ {limit}</span>
          </p>
          <p className="mt-2 text-xs text-fg-muted">
            {t("mediaKit.planLabel")}{" "}
            {canAddConnection(kits.length)
              ? t("mediaKit.canConnectMore")
              : t("mediaKit.allConnectionsUsed")}
          </p>
        </GlassPanel>

        <GlassPanel className="p-5">
          <p className="text-sm font-medium text-fg-muted">
            {t("mediaKit.verifiedAudiences")}
          </p>
          <p className="mt-1.5 text-lg font-semibold text-fg tabular-nums">
            {verifiedCount}
          </p>
          <p className="mt-2 text-xs text-fg-muted">
            {t("mediaKit.verifiedIncluded")}
          </p>
        </GlassPanel>

        <GlassPanel className="p-5">
          <p className="text-sm font-medium text-fg-muted">
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

              {accountConnectAvailable(platform) && !blocked && !demo ? (
                <ConnectAccountPanel platform={platform} kit={kit} />
              ) : null}

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
                    <>
                      <YoutubeSyncPanel kit={kit} snapshots={snapshots.filter((s) => s.media_kit_id === kit.id)} />
                      <ContentPerformancePanel videos={videos.filter((v) => v.media_kit_id === kit.id)} complete={kit.recent_videos_complete === true} />
                    </>
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

    </>
  );
}

const CONNECT_ERRORS = ["unavailable", "denied", "state", "token", "account", "taken", "save", "reconnect"] as const;

/** `connect_error=<platform>:<reason>` from the connect callback; unknown values show nothing. */
function ConnectErrorBanner({ value }: { value: string }) {
  const { t } = useTranslation();
  const [platform, reason] = value.split(":");
  if (!PLATFORMS.includes(platform as Platform)) return null;
  if (!(CONNECT_ERRORS as readonly string[]).includes(reason)) return null;
  return (
    <div className="mb-4">
      <Alert>{t(`mediaKit.connect.errors.${reason}`, { platform: PLATFORM_LABELS[platform as Platform] })}</Alert>
    </div>
  );
}

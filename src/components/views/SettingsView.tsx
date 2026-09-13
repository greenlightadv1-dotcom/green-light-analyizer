"use client";

import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { AccountCard } from "@/components/settings/AccountCard";
import { InboundAliasCard } from "@/components/settings/InboundAliasCard";
import { SocialConnections } from "@/components/settings/SocialConnections";
import { WhatsAppSettingsCard } from "@/components/settings/WhatsAppSettingsCard";
import { useTranslation } from "@/components/LocaleProvider";
import type { Profile } from "@/lib/auth";
import type { OAuthPlatform } from "@/lib/types/database";

/**
 * Settings, presentation only. Shared with /preview.
 *
 * No plan/billing or promo-code UI here anymore — that moved to the new
 * /pricing page (§4.3: billing is Discord-only, and the plan cards now live
 * where a creator would actually go looking for them, not tucked into
 * Settings). This page is Account + the email intake pipeline + WhatsApp,
 * plus a read-only summary of the creator's analytics connections — a link
 * into the OAuth start route and nothing else. The editable half of a
 * platform (reach, category, self-reported geography, §7.1) stays on the
 * Media Kit, so no field lives in two places.
 */
export function SettingsView({
  profile,
  demo = false,
  connections,
}: {
  profile: Profile;
  demo?: boolean;
  /**
   * Live §7.3 connections, creators only. Companies have no media_kits row,
   * so the card is not rendered for them at all rather than shown empty.
   */
  connections?: Partial<Record<OAuthPlatform, boolean>>;
}) {
  const { t } = useTranslation();

  return (
    <>
      <SectionHeader
        title={t("settings.title")}
        description={t("settings.description")}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <AccountCard profile={profile} demo={demo} />

        {/*
          WhatsApp and the connections summary share the second column rather
          than each taking a grid cell of their own: three half-width cards
          would leave one orphaned beside an empty cell, and a full-width
          connections card would strand its Connect buttons a screen away
          from the platform they belong to on a wide monitor.
        */}
        <div className="space-y-4">
          <WhatsAppSettingsCard profile={profile} demo={demo} />
          {profile.role === "creator" ? (
            <SocialConnections connections={connections} demo={demo} />
          ) : null}
        </div>

        <div className="lg:col-span-2">
          <InboundAliasCard alias={profile.inbound_alias} />
        </div>
      </div>
    </>
  );
}

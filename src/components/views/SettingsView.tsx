"use client";

import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { AccountCard } from "@/components/settings/AccountCard";
import { InboundAliasCard } from "@/components/settings/InboundAliasCard";
import { WhatsAppSettingsCard } from "@/components/settings/WhatsAppSettingsCard";
import { useTranslation } from "@/components/LocaleProvider";
import type { Profile } from "@/lib/auth";

/**
 * Settings, presentation only. Shared with /preview.
 *
 * No plan/billing or promo-code UI here anymore — that moved to the new
 * /pricing page (§4.3: billing is Discord-only, and the plan cards now live
 * where a creator would actually go looking for them, not tucked into
 * Settings). This page is Account + the email intake pipeline + WhatsApp.
 */
export function SettingsView({
  profile,
  demo = false,
}: {
  profile: Profile;
  demo?: boolean;
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
        <WhatsAppSettingsCard profile={profile} demo={demo} />

        <div className="lg:col-span-2">
          <InboundAliasCard alias={profile.inbound_alias} />
        </div>
      </div>
    </>
  );
}

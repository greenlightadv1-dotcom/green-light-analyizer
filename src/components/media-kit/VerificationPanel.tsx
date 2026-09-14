"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";
import {
  VERIFICATION_SUPPORT,
  verificationAvailability,
} from "@/lib/media-kit/platforms";
import type { Platform, SubscriptionPlan } from "@/lib/types/database";

/**
 * The §7.3 connection state, read-only, in four honest states.
 *
 *   connected     — verified geo is live, sourced from an Analytics API
 *   available     — platform supports it and the plan includes it
 *   needs-upgrade — platform supports it, the plan does not (§8)
 *   unsupported   — no API exists, so no plan can deliver it (§7.3)
 *
 * The last two are kept separate on purpose: telling a Starter creator to
 * upgrade for Twitch audience geography would be selling something upgrading
 * cannot provide.
 *
 * Connect, sync and disconnect are not here. They live once, in Settings'
 * SocialConnections card, so a creator is never choosing between two places
 * that manage the same connection. The link below is navigation, not an
 * action on the connection.
 */
export function VerificationPanel({
  platform,
  plan,
  connected,
}: {
  platform: Platform;
  plan: SubscriptionPlan;
  connected: boolean;
}) {
  const { t } = useTranslation();
  const support = VERIFICATION_SUPPORT[platform];
  const availability = verificationAvailability(platform, plan);

  if (connected) {
    return (
      <div className="rounded-xl border border-brand-green/20 bg-brand-green/5 p-3.5">
        <p className="text-xs leading-relaxed text-fg/60">
          {t("mediaKit.syncingFromSource", { source: support.source })}
        </p>
        <Link
          href="/settings"
          className="mt-2.5 inline-block text-xs text-brand-green underline underline-offset-4 transition hover:text-fg"
        >
          {t("mediaKit.manageInSettings")}
        </Link>
      </div>
    );
  }

  if (availability === "unsupported") {
    return (
      <div className="rounded-xl border border-fg/8 bg-fg/3 p-3.5">
        <p className="text-xs leading-relaxed text-fg/40">{support.note}</p>
      </div>
    );
  }

  if (availability === "needs-upgrade") {
    return (
      <div className="rounded-xl border border-fg/10 bg-fg/5 p-3.5">
        <p className="text-xs leading-relaxed text-fg/50">
          {t("mediaKit.includedProElite", { source: support.source })}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-fg/30">
          {t("mediaKit.upgradesOverDiscordNote")}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-fg/10 bg-fg/5 p-3.5">
      <p className="text-xs leading-relaxed text-fg/55">{support.note}</p>
      <Link
        href="/settings"
        className="mt-2.5 inline-block text-xs text-brand-green underline underline-offset-4 transition hover:text-fg"
      >
        {t("mediaKit.connectInSettings")}
      </Link>
    </div>
  );
}

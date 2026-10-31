"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";
import { IntegrationStatusBadge } from "@/components/media-kit/IntegrationStatusBadge";
import {
  VERIFICATION_SUPPORT,
  verificationAvailability,
} from "@/lib/media-kit/platforms";
import type { Platform } from "@/lib/types/database";

/**
 * The §7.3 connection state, read-only, in four honest states.
 *
 *   connected      — verified geo is live, sourced from an Analytics API
 *   available      — the platform's integration is operational (YouTube)
 *   in-development — the platform could support it, but its integration is
 *                    not operational yet (Instagram); no Connect is offered
 *   unsupported    — no API exists, so stats stay self-reported (§7.3)
 *
 * Every creator is on the same Creator Plan, so none of these states is
 * about a plan — they describe the platform (media-kit/platforms.ts).
 *
 * Connect, sync and disconnect are not here. They live once, in Settings'
 * SocialConnections card, so a creator is never choosing between two places
 * that manage the same connection. The link below is navigation, not an
 * action on the connection.
 */
export function VerificationPanel({
  platform,
  connected,
}: {
  platform: Platform;
  connected: boolean;
}) {
  const { t } = useTranslation();
  const support = VERIFICATION_SUPPORT[platform];
  const availability = verificationAvailability(platform);

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

  if (availability === "in-development") {
    return (
      <div className="rounded-xl border border-fg/10 bg-fg/5 p-3.5">
        <IntegrationStatusBadge status="in_development" />
        <p className="mt-2 text-xs leading-relaxed text-fg/50">
          {t("mediaKit.inDevelopmentNote", { source: support.source })}
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

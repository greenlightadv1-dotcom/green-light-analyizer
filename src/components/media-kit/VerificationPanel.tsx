"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslation } from "@/components/LocaleProvider";
import {
  connectAnalytics,
  disconnectAnalytics,
  syncVerifiedGeo,
  type SyncVerifiedGeoState,
} from "@/lib/media-kit/actions";
import {
  VERIFICATION_SUPPORT,
  verificationAvailability,
} from "@/lib/media-kit/platforms";
import type { Platform, SubscriptionPlan } from "@/lib/types/database";

const REAL_OAUTH_PLATFORMS: Platform[] = ["youtube", "instagram"];

function SyncButton() {
  const { pending } = useFormStatus();
  const { t } = useTranslation();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-brand-green underline underline-offset-4 transition hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? t("common.syncing") : t("mediaKit.syncNow")}
    </button>
  );
}

/**
 * The §7.3 connection control, in four honest states.
 *
 *   connected     — verified geo is live; offers sync + disconnect (§12)
 *   available     — platform supports it and the plan includes it
 *   needs-upgrade — platform supports it, the plan does not (§8)
 *   unsupported   — no API exists, so no plan can deliver it (§7.3)
 *
 * The last two are kept separate on purpose: telling a Starter creator to
 * upgrade for Twitch audience geography would be selling something upgrading
 * cannot provide.
 */
export function VerificationPanel({
  platform,
  plan,
  connected,
  configured,
}: {
  platform: Platform;
  plan: SubscriptionPlan;
  connected: boolean;
  /** True when this platform's OAuth app is actually registered (client ID/secret present). */
  configured: boolean;
}) {
  const { t } = useTranslation();
  const support = VERIFICATION_SUPPORT[platform];
  const availability = verificationAvailability(platform, plan);
  const [syncState, syncAction] = useActionState<SyncVerifiedGeoState, FormData>(
    syncVerifiedGeo,
    { error: null, synced: false },
  );

  if (connected) {
    return (
      <div className="rounded-xl border border-brand-green/20 bg-brand-green/5 p-3.5">
        <p className="text-xs leading-relaxed text-fg/60">
          {t("mediaKit.syncingFromSource", { source: support.source })}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-4">
          {REAL_OAUTH_PLATFORMS.includes(platform) ? (
            <form action={syncAction}>
              <input type="hidden" name="platform" value={platform} />
              <SyncButton />
            </form>
          ) : null}

          <form action={disconnectAnalytics}>
            <input type="hidden" name="platform" value={platform} />
            <button
              type="submit"
              className="text-xs text-fg/45 underline underline-offset-4 transition hover:text-fg/80"
            >
              {t("common.disconnect")}
            </button>
          </form>
        </div>

        {syncState.error ? (
          <p className="mt-2 text-[11px] text-red-700 dark:text-red-300">{syncState.error}</p>
        ) : null}
        {syncState.synced ? (
          <p className="mt-2 text-[11px] text-brand-green">{t("common.synced")}</p>
        ) : null}

        <p className="mt-2 text-[11px] leading-relaxed text-fg/30">
          {t("mediaKit.disconnectClearsNote")}
        </p>
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
      <form action={connectAnalytics} className="mt-2.5">
        <input type="hidden" name="platform" value={platform} />
        <button
          type="submit"
          className="rounded-lg border border-brand-green/30 bg-brand-green/10 px-3 py-1.5 text-xs font-medium text-brand-green transition hover:bg-brand-green/20"
        >
          {t("mediaKit.connectAnalytics", { source: support.source.split(" ")[0] })}
        </button>
      </form>
      {!configured ? (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-700/60 dark:text-amber-200/60">
          {t("mediaKit.pendingReview")}
        </p>
      ) : null}
    </div>
  );
}

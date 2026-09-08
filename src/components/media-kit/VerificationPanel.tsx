"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
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
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-brand-green underline underline-offset-4 transition hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Syncing…" : "Sync now"}
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
          Verified audience data is syncing from {support.source}.
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
              Disconnect
            </button>
          </form>
        </div>

        {syncState.error ? (
          <p className="mt-2 text-[11px] text-red-700 dark:text-red-300">{syncState.error}</p>
        ) : null}
        {syncState.synced ? (
          <p className="mt-2 text-[11px] text-brand-green">Synced.</p>
        ) : null}

        <p className="mt-2 text-[11px] leading-relaxed text-fg/30">
          Disconnecting clears your verified audience data immediately and drops
          the badge.
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
          Verified audience geography from {support.source} is included on Pro
          and Elite.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-fg/30">
          Upgrades are handled over Discord — there is no billing in the app.
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
          Connect {support.source.split(" ")[0]} analytics
        </button>
      </form>
      {!configured ? (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-700/60 dark:text-amber-200/60">
          Not available yet — this connection is waiting on platform app
          review.
        </p>
      ) : null}
    </div>
  );
}

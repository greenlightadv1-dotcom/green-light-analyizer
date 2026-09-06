import { connectAnalytics, disconnectAnalytics } from "@/lib/media-kit/actions";
import {
  VERIFICATION_SUPPORT,
  verificationAvailability,
} from "@/lib/media-kit/platforms";
import type { Platform, SubscriptionPlan } from "@/lib/types/database";

/**
 * The §7.3 connection control, in four honest states.
 *
 *   connected     — verified geo is live; offers disconnect (§12)
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
}: {
  platform: Platform;
  plan: SubscriptionPlan;
  connected: boolean;
}) {
  const support = VERIFICATION_SUPPORT[platform];
  const availability = verificationAvailability(platform, plan);

  if (connected) {
    return (
      <div className="rounded-xl border border-brand-green/20 bg-brand-green/5 p-3.5">
        <p className="text-xs leading-relaxed text-white/60">
          Verified audience data is syncing from {support.source}.
        </p>
        <form action={disconnectAnalytics} className="mt-2.5">
          <input type="hidden" name="platform" value={platform} />
          <button
            type="submit"
            className="text-xs text-white/45 underline underline-offset-4 transition hover:text-white/80"
          >
            Disconnect
          </button>
        </form>
        <p className="mt-2 text-[11px] leading-relaxed text-white/30">
          Disconnecting clears your verified audience data immediately and drops
          the badge.
        </p>
      </div>
    );
  }

  if (availability === "unsupported") {
    return (
      <div className="rounded-xl border border-white/8 bg-white/3 p-3.5">
        <p className="text-xs leading-relaxed text-white/40">{support.note}</p>
      </div>
    );
  }

  if (availability === "needs-upgrade") {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
        <p className="text-xs leading-relaxed text-white/50">
          Verified audience geography from {support.source} is included on Pro
          and Elite.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-white/30">
          Upgrades are handled over Discord — there is no billing in the app.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
      <p className="text-xs leading-relaxed text-white/55">{support.note}</p>
      <form action={connectAnalytics} className="mt-2.5">
        <input type="hidden" name="platform" value={platform} />
        <button
          type="submit"
          className="rounded-lg border border-brand-green/30 bg-brand-green/10 px-3 py-1.5 text-xs font-medium text-brand-green transition hover:bg-brand-green/20"
        >
          Connect {support.source.split(" ")[0]} analytics
        </button>
      </form>
      {/*
        The handshake is not built: it needs a verified Google OAuth consent
        screen / Meta App Review plus token storage. Saying so here beats a
        button that dead-ends without explanation.
      */}
      <p className="mt-2 text-[11px] leading-relaxed text-amber-200/60">
        Not available yet — this connection is waiting on platform app review.
      </p>
    </div>
  );
}

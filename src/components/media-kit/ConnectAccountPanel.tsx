"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { VerifiedTag } from "@/components/deals/VerifiedTag";
import { useTranslation } from "@/components/LocaleProvider";
import {
  disconnectConnectedAccount,
  syncConnectedAccount,
  type ConnectSyncState,
} from "@/lib/connect/actions";
import { PLATFORM_LABELS } from "@/lib/media-kit/platforms";
import type { MediaKit } from "@/lib/media-kit/helpers";
import type { Platform } from "@/lib/types/database";

const pill =
  "inline-flex items-center rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50";

function SyncButton() {
  const { pending } = useFormStatus();
  const { t } = useTranslation();
  return (
    <button type="submit" disabled={pending} className={pill}>
      {pending ? t("common.syncing") : t("mediaKit.connect.syncNow")}
    </button>
  );
}

/**
 * Twitch, Kick and TikTok account connection (0042). Rendered only when the
 * platform's connection is switched on. "Connected" is read from the kit's
 * stats_synced_at, which only the connection callback and sync ever set and
 * disconnecting clears; the token itself is never visible to the browser.
 */
export function ConnectAccountPanel({ platform, kit }: { platform: Platform; kit: MediaKit | null }) {
  const { t } = useTranslation();
  const [state, formAction] = useActionState<ConnectSyncState, FormData>(syncConnectedAccount, {
    error: null,
    synced: false,
  });
  const label = PLATFORM_LABELS[platform];
  const connected = Boolean(kit?.stats_synced_at);

  return (
    <div className="rounded-2xl border border-line bg-surface-soft p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-fg-muted">{t("mediaKit.connect.title")}</p>
        {connected ? <VerifiedTag verified /> : null}
      </div>

      {connected && kit ? (
        <>
          <p className="mt-2 text-sm text-fg">
            {t("mediaKit.connect.connectedAs", { handle: kit.platform_handle ?? "—" })}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            {kit.subscriber_count !== null ? (
              <div>
                <dt className="text-xs text-fg-muted">{t("mediaKit.connect.followers")}</dt>
                <dd className="text-sm text-fg tabular-nums">{kit.subscriber_count.toLocaleString("en-US")}</dd>
              </div>
            ) : null}
            {kit.media_count !== null ? (
              <div>
                <dt className="text-xs text-fg-muted">{t("mediaKit.connect.videos")}</dt>
                <dd className="text-sm text-fg tabular-nums">{kit.media_count.toLocaleString("en-US")}</dd>
              </div>
            ) : null}
            {kit.recent_median_views != null && kit.recent_views_sample ? (
              <div className="col-span-2">
                <dt className="text-xs text-fg-muted">
                  {t("mediaKit.connect.recentMedian", { count: kit.recent_views_sample })}
                </dt>
                <dd className="text-sm text-fg tabular-nums">{kit.recent_median_views.toLocaleString("en-US")}</dd>
              </div>
            ) : null}
          </dl>
          {platform === "kick" ? (
            <p className="mt-2 text-xs leading-relaxed text-fg-muted">{t("mediaKit.connect.kickNote")}</p>
          ) : null}
          <p className="mt-2 text-xs text-fg-muted">
            {t("mediaKit.connect.lastSynced", {
              date: new Date(kit.stats_synced_at as string).toLocaleString(),
            })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={formAction}>
              <input type="hidden" name="platform" value={platform} />
              <SyncButton />
            </form>
            <form action={disconnectConnectedAccount}>
              <input type="hidden" name="platform" value={platform} />
              <button type="submit" className={pill}>
                {t("mediaKit.connect.disconnect")}
              </button>
            </form>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-xs leading-relaxed text-fg-muted">
            {t("mediaKit.connect.intro", { platform: label })}
          </p>
          <a href={`/api/connect/${platform}/start`} className={`${pill} mt-3`}>
            {t("mediaKit.connect.connectButton", { platform: label })}
          </a>
        </>
      )}

      <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
        {t("mediaKit.connect.geoNote", { platform: label })}
      </p>

      {state.error ? (
        <div className="mt-2.5">
          <Alert>{t(state.error)}</Alert>
        </div>
      ) : null}
      {state.synced ? <p className="mt-2.5 text-xs text-accent">{t("common.synced")}</p> : null}
    </div>
  );
}

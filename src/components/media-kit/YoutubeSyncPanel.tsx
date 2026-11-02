"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { VerifiedTag } from "@/components/deals/VerifiedTag";
import { NicheDetector } from "@/components/media-kit/NicheDetector";
import { useTranslation } from "@/components/LocaleProvider";
import {
  syncYoutubeStats,
  type SyncYoutubeState,
} from "@/lib/media-kit/actions";
import type { MediaKit } from "@/lib/media-kit/queries";
import type { MediaKitSnapshot } from "@/lib/types/database";
import { computeGrowth, type Growth } from "@/lib/media-kit/growth";

function SyncButton() {
  const { pending } = useFormStatus();
  const { t } = useTranslation();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-fg/10 bg-fg/5 px-3 py-1.5 text-xs text-fg/70 transition hover:bg-fg/10 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? t("common.syncing") : t("mediaKit.syncFromYoutube")}
    </button>
  );
}

/**
 * Channel-level stats via the YouTube Data API v3 (§9) — separate from
 * avg_views/avg_ccv, which stay the creator's own self-reported per-video
 * figures. subscriber_count/channel_view_count/media_count are non-NULL
 * only once this has run at least once, the same verified-by-non-NULL
 * convention as verified_top_countries (§7.2). engagement_rate IS the same
 * field the creator can set manually above — a sync overwrites it rather
 * than duplicating it, since it's the same measured quantity either way
 * (see media-kit/actions.ts's syncYoutubeStats doc comment).
 */
export function YoutubeSyncPanel({ kit, snapshots = [] }: { kit: MediaKit; snapshots?: MediaKitSnapshot[] }) {
  const { t } = useTranslation();
  const [state, formAction] = useActionState<SyncYoutubeState, FormData>(
    syncYoutubeStats,
    { error: null, synced: false },
  );

  const hasStats =
    kit.subscriber_count !== null ||
    kit.channel_view_count !== null ||
    kit.media_count !== null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-fg/10 bg-fg/5 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium tracking-wide text-fg/70 uppercase">
            {t("mediaKit.channelStats")}
          </p>
          {hasStats ? <VerifiedTag verified /> : null}
        </div>

        {hasStats ? (
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-fg-muted">{t("mediaKit.subscribers")}</dt>
              <dd className="text-sm text-fg tabular-nums">
                {kit.subscriber_count?.toLocaleString("en-US") ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">{t("mediaKit.lifetimeViews")}</dt>
              <dd className="text-sm text-fg tabular-nums">
                {kit.channel_view_count?.toLocaleString("en-US") ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">{t("mediaKit.videos")}</dt>
              <dd className="text-sm text-fg tabular-nums">
                {kit.media_count?.toLocaleString("en-US") ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">{t("mediaKit.engagementLast10")}</dt>
              <dd className="text-sm text-fg tabular-nums">
                {kit.engagement_rate !== null ? `${kit.engagement_rate}%` : "—"}
              </dd>
            </div>
          </dl>
        ) : null}
        {hasStats ? <GrowthSummary snapshots={snapshots} /> : null}
        {hasStats ? null : (
          <p className="mt-2 text-xs leading-relaxed text-fg-muted">
            {t("mediaKit.notSyncedRequiresHandle")}
          </p>
        )}

        <form action={formAction} className="mt-3">
          <input type="hidden" name="media_kit_id" value={kit.id} />
          <SyncButton />
        </form>

        {state.error ? (
          <div className="mt-2.5">
            <Alert>{t(state.error)}</Alert>
          </div>
        ) : null}
        {state.synced ? (
          <p className="mt-2.5 text-xs text-brand-green">{t("common.synced")}</p>
        ) : null}
      </div>

      <NicheDetector
        mediaKitId={kit.id}
        currentCategory={kit.content_category}
        currentTags={kit.content_tags}
      />
    </div>
  );
}

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("en-US")}`;

/**
 * Growth from real snapshots only (lib/media-kit/growth.ts). With fewer than
 * two snapshots on different days it says so instead of showing a number.
 */
function GrowthSummary({ snapshots }: { snapshots: MediaKitSnapshot[] }) {
  const { t } = useTranslation();
  const now = new Date();
  const rows = (
    [
      ["subscriber_count", "growth.subscribers"],
      ["channel_view_count", "growth.views"],
    ] as const
  )
    .map(([metric, label]) => ({ label, g: computeGrowth(snapshots, metric, now) }))
    .filter((r): r is { label: "growth.subscribers" | "growth.views"; g: Growth } => r.g !== null);

  return (
    <div className="mt-3 border-t border-line pt-3" data-testid="growth-summary">
      <p className="text-xs font-medium text-fg-muted">{t("growth.title")}</p>
      {rows.length ? (
        <>
          <dl className="mt-1.5 space-y-1">
            {rows.map(({ label, g }) => (
              <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <dt className="text-fg-secondary">{t(label)}</dt>
                <dd className={`tabular-nums ${g.change < 0 ? "text-danger" : g.change > 0 ? "text-success" : "text-fg"}`}>
                  {g.pct === null
                    ? t("growth.changeNoPct", { change: signed(g.change), days: g.days })
                    : t("growth.change", { change: signed(g.change), pct: `${g.pct > 0 ? "+" : ""}${g.pct}%`, days: g.days })}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-1.5 text-xs text-fg-muted">
            {/* Each date is isolated left-to-right (U+2066…U+2069) so it reads
                correctly inside an Arabic sentence. */}
            {t("growth.period", { from: `\u2066${rows[0].g.fromDate}\u2069`, to: `\u2066${rows[0].g.toDate}\u2069` })}
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">{t("growth.empty")}</p>
      )}
    </div>
  );
}

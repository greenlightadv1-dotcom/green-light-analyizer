"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { VerifiedTag } from "@/components/deals/VerifiedTag";
import { NicheDetector } from "@/components/media-kit/NicheDetector";
import {
  syncYoutubeStats,
  type SyncYoutubeState,
} from "@/lib/media-kit/actions";
import type { MediaKit } from "@/lib/media-kit/queries";

function SyncButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-fg/10 bg-fg/5 px-3 py-1.5 text-xs text-fg/70 transition hover:bg-fg/10 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Syncing…" : "Sync from YouTube"}
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
export function YoutubeSyncPanel({ kit }: { kit: MediaKit }) {
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
            Channel stats
          </p>
          {hasStats ? <VerifiedTag verified /> : null}
        </div>

        {hasStats ? (
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-fg/45">Subscribers</dt>
              <dd className="text-sm text-fg tabular-nums">
                {kit.subscriber_count?.toLocaleString("en-US") ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg/45">Lifetime views</dt>
              <dd className="text-sm text-fg tabular-nums">
                {kit.channel_view_count?.toLocaleString("en-US") ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg/45">Videos</dt>
              <dd className="text-sm text-fg tabular-nums">
                {kit.media_count?.toLocaleString("en-US") ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg/45">Engagement (last 10)</dt>
              <dd className="text-sm text-fg tabular-nums">
                {kit.engagement_rate !== null ? `${kit.engagement_rate}%` : "—"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-fg/40">
            Not synced yet. Requires a channel handle above.
          </p>
        )}

        <form action={formAction} className="mt-3">
          <input type="hidden" name="media_kit_id" value={kit.id} />
          <SyncButton />
        </form>

        {state.error ? (
          <div className="mt-2.5">
            <Alert>{state.error}</Alert>
          </div>
        ) : null}
        {state.synced ? (
          <p className="mt-2.5 text-xs text-brand-green">Synced.</p>
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

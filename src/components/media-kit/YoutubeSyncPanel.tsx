"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { VerifiedTag } from "@/components/deals/VerifiedTag";
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
      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Syncing…" : "Sync from YouTube"}
    </button>
  );
}

/**
 * Channel-level stats via the YouTube Data API v3 (§9) — separate from
 * avg_views/avg_ccv, which stay the creator's own self-reported per-video
 * figures. subscriber_count/channel_view_count are non-NULL only once this
 * has run at least once, the same verified-by-non-NULL convention as
 * verified_top_countries (§7.2).
 */
export function YoutubeSyncPanel({ kit }: { kit: MediaKit }) {
  const [state, formAction] = useActionState<SyncYoutubeState, FormData>(
    syncYoutubeStats,
    { error: null, synced: false },
  );

  const hasStats = kit.subscriber_count !== null || kit.channel_view_count !== null;

  return (
    <div className="rounded-xl border border-white/8 bg-navy-dark/40 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-white/70 uppercase">
          Channel stats
        </p>
        {hasStats ? <VerifiedTag verified /> : null}
      </div>

      {hasStats ? (
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-white/45">Subscribers</dt>
            <dd className="text-sm text-white tabular-nums">
              {kit.subscriber_count?.toLocaleString("en-US") ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-white/45">Lifetime views</dt>
            <dd className="text-sm text-white tabular-nums">
              {kit.channel_view_count?.toLocaleString("en-US") ?? "—"}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-white/40">
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
  );
}

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { VerifiedTag } from "@/components/deals/VerifiedTag";
import { NicheDetector } from "@/components/media-kit/NicheDetector";
import { useTranslation } from "@/components/LocaleProvider";
import {
  syncInstagramStats,
  type SyncInstagramState,
} from "@/lib/media-kit/actions";
import type { MediaKit } from "@/lib/media-kit/queries";

function SyncButton() {
  const { pending } = useFormStatus();
  const { t } = useTranslation();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-fg/10 bg-fg/5 px-3 py-1.5 text-xs text-fg/70 transition hover:bg-fg/10 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? t("common.syncing") : t("mediaKit.syncFromInstagram")}
    </button>
  );
}

/**
 * Follower/media counts via the Instagram Graph API — needs the same §7.3
 * OAuth connection as verified audience geography (unlike YouTube, there is
 * no API-key-only public path for this), so only ever rendered once
 * analytics_oauth_connected is true — see MediaKitView.
 */
export function InstagramSyncPanel({ kit }: { kit: MediaKit }) {
  const { t } = useTranslation();
  const [state, formAction] = useActionState<SyncInstagramState, FormData>(
    syncInstagramStats,
    { error: null, synced: false },
  );

  const hasStats = kit.subscriber_count !== null || kit.media_count !== null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-fg/10 bg-fg/5 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium tracking-wide text-fg/70 uppercase">
            {t("mediaKit.accountStats")}
          </p>
          {hasStats ? <VerifiedTag verified /> : null}
        </div>

        {hasStats ? (
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-fg/45">{t("mediaKit.followers")}</dt>
              <dd className="text-sm text-fg tabular-nums">
                {kit.subscriber_count?.toLocaleString("en-US") ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg/45">{t("mediaKit.posts")}</dt>
              <dd className="text-sm text-fg tabular-nums">
                {kit.media_count?.toLocaleString("en-US") ?? "—"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-fg/40">
            {t("mediaKit.notSyncedYet")}
          </p>
        )}

        <form action={formAction} className="mt-3">
          <SyncButton />
        </form>

        {state.error ? (
          <div className="mt-2.5">
            <Alert>{state.error}</Alert>
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

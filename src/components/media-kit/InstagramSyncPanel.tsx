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
      className="inline-flex items-center rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50"
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
      <div className="rounded-2xl border border-line bg-surface-soft p-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-fg-muted">
            {t("mediaKit.accountStats")}
          </p>
          {hasStats ? <VerifiedTag verified /> : null}
        </div>

        {hasStats ? (
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-fg-muted">{t("mediaKit.followers")}</dt>
              <dd className="text-sm text-fg tabular-nums">
                {kit.subscriber_count?.toLocaleString("en-US") ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">{t("mediaKit.posts")}</dt>
              <dd className="text-sm text-fg tabular-nums">
                {kit.media_count?.toLocaleString("en-US") ?? "—"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-fg-muted">
            {t("mediaKit.notSyncedYet")}
          </p>
        )}

        <form action={formAction} className="mt-3">
          <SyncButton />
        </form>

        {state.error ? (
          <div className="mt-2.5">
            <Alert>{t(state.error)}</Alert>
          </div>
        ) : null}
        {state.synced ? (
          <p className="mt-2.5 text-xs text-accent">{t("common.synced")}</p>
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

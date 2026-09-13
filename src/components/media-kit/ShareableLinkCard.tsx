"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import { siteUrl } from "@/lib/constants/site";

/** Public path for the anon-readable creator_public_profile() RPC (migration 0017). */
export function shareableProfileUrl(slug: string): string {
  return `${siteUrl()}/p/${slug}`;
}

/**
 * "Shareable Profile Link generator." The slug itself is generated
 * server-side on first CreatorProfileCard save (lib/media-kit/actions.ts's
 * saveCreatorProfile) — this card only displays and copies it.
 */
export function ShareableLinkCard({ slug }: { slug: string | null }) {
  const { t } = useTranslation();

  return (
    <GlassPanel className="p-6">
      <h2 className="text-sm font-semibold text-fg">{t("mediaKit.shareableLink")}</h2>
      {slug ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 rounded-xl border border-fg/10 bg-navy-dark/70 px-3.5 py-2.5 font-mono text-sm break-all text-brand-green">
              {shareableProfileUrl(slug).replace(/^https?:\/\//, "")}
            </code>
            <CopyButton value={shareableProfileUrl(slug)} />
          </div>
          <p className="mt-2 text-xs text-fg/40">{t("mediaKit.shareableLinkNote")}</p>
        </>
      ) : (
        <p className="mt-2 text-xs text-fg/40">{t("mediaKit.shareableLinkPending")}</p>
      )}
    </GlassPanel>
  );
}

"use client";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import {
  OAUTH_PLACEHOLDER_PLATFORMS,
  OAUTH_PLACEHOLDER_LABELS,
} from "@/lib/oauth/platforms";

/**
 * Locked teaser for platforms with no registered OAuth app yet.
 *
 * Same visible-but-not-clickable pattern as ComingSoonCard (CLAUDE.md §11):
 * rendered as a non-interactive element (no button, no link, aria-disabled)
 * so it is genuinely locked rather than styled to look locked.
 */
export function OAuthPlaceholderCard() {
  const { t } = useTranslation();
  return (
    <GlassPanel
      as="section"
      aria-disabled="true"
      className="p-6 opacity-70 select-none"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-fg">{t("mediaKit.morePlatforms")}</h2>
        <span className="rounded-full border border-brand-green/30 bg-brand-green/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-brand-green uppercase">
          {t("common.comingSoon")}
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-fg/40">
        {t("mediaKit.morePlatformsBody")}
      </p>

      <ul className="mt-4 flex flex-wrap gap-2">
        {OAUTH_PLACEHOLDER_PLATFORMS.map((platform) => (
          <li
            key={platform}
            className="rounded-lg border border-fg/10 bg-fg/5 px-3 py-1.5 text-xs text-fg/45"
          >
            {OAUTH_PLACEHOLDER_LABELS[platform]}
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
}

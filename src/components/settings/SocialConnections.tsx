"use client";

import type { ReactNode } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import { PLATFORM_LABELS } from "@/lib/media-kit/platforms";
import { REAL_OAUTH_PLATFORMS } from "@/lib/oauth/platforms";
import type { OAuthPlatform } from "@/lib/types/database";

const ICON_CLASSNAMES: Record<OAuthPlatform, string> = {
  youtube: "bg-[#FF0000]/10 text-[#FF0000]",
  instagram: "bg-[#E1306C]/10 text-[#E1306C]",
};

const ICONS: Record<OAuthPlatform, ReactNode> = {
  youtube: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8ZM9.5 15.6V8.4l6.3 3.6-6.3 3.6Z" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.8s0 3.5-.1 4.8c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4a3.9 3.9 0 0 1-1.4-.9 3.9 3.9 0 0 1-.9-1.4c-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.8s0-3.5.1-4.8c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.9-.1Zm0 1.8c-3.1 0-3.5 0-4.7.1-1.1.1-1.7.2-2.1.3-.5.2-.9.4-1.2.8-.4.3-.6.7-.8 1.2-.1.4-.3 1-.3 2.1-.1 1.2-.1 1.6-.1 4.7s0 3.5.1 4.7c.1 1.1.2 1.7.3 2.1.2.5.4.9.8 1.2.3.4.7.6 1.2.8.4.1 1 .3 2.1.3 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1.1-.1 1.7-.2 2.1-.3.5-.2.9-.4 1.2-.8.4-.3.6-.7.8-1.2.1-.4.3-1 .3-2.1.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c-.1-1.1-.2-1.7-.3-2.1a3.2 3.2 0 0 0-.8-1.2 3.2 3.2 0 0 0-1.2-.8c-.4-.1-1-.3-2.1-.3-1.2-.1-1.6-.1-4.7-.1Zm0 3.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8Zm0 8a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Zm6.3-8.2a1.2 1.2 0 1 1-2.3 0 1.2 1.2 0 0 1 2.3 0Z" />
    </svg>
  ),
};

const CONNECT_CLASSNAME =
  "inline-flex items-center justify-center rounded-lg border border-brand-green/30 bg-brand-green/10 px-3.5 py-2 text-xs font-medium text-brand-green transition hover:bg-brand-green/20";

function StatusBadge({ connected }: { connected: boolean }) {
  const { t } = useTranslation();

  return connected ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-green/30 bg-brand-green/10 px-2.5 py-1 text-[11px] font-medium text-brand-green">
      <span className="h-1.5 w-1.5 rounded-full bg-brand-green" aria-hidden />
      {t("common.connected")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-fg/10 bg-fg/5 px-2.5 py-1 text-[11px] font-medium text-fg/45">
      <span className="h-1.5 w-1.5 rounded-full bg-fg/25" aria-hidden />
      {t("common.notConnected")}
    </span>
  );
}

/**
 * Read-only summary of the §7.3 analytics connections.
 *
 * Deliberately holds no inputs of its own. Everything a creator types —
 * reach, category, language, self-reported audience geography (§7.1) — lives
 * on the Media Kit's PlatformCard, and everything verified arrives through
 * OAuth. A field here would be a third place the same data could come from.
 *
 * Only platforms with a working connector are listed; the rest are the
 * OAuthPlaceholderCard's job, so a button here never points at a route that
 * cannot complete.
 */
export function SocialConnections({
  connections = {},
  demo = false,
}: {
  connections?: Partial<Record<OAuthPlatform, boolean>>;
  /** /preview renders the shell with no session — the link must not navigate. */
  demo?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <GlassPanel as="section" className="p-6">
      <h2 className="text-sm font-semibold text-fg">{t("settings.socialTitle")}</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-fg/50">
        {t("settings.socialNote")}
      </p>

      <ul className="mt-5 space-y-3">
        {REAL_OAUTH_PLATFORMS.map((platform) => {
          const connected = connections[platform] === true;

          return (
            <li
              key={platform}
              className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-fg/10 bg-fg/5 p-4"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${ICON_CLASSNAMES[platform]}`}
              >
                {ICONS[platform]}
              </span>

              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-fg">
                  {PLATFORM_LABELS[platform]}
                </span>
                <StatusBadge connected={connected} />
              </div>

              {/*
                A plain <a>: /api/oauth/<platform>/start answers with a 302 to
                the provider's consent screen, so the navigation has to leave
                the client router. The route itself re-checks the session and
                the plan gate — this markup is never the gate.
              */}
              {connected ? null : demo ? (
                <span
                  aria-disabled="true"
                  className={`${CONNECT_CLASSNAME} ms-auto opacity-50`}
                >
                  {t("common.connect")}
                </span>
              ) : (
                <a
                  href={`/api/oauth/${platform}/start`}
                  className={`${CONNECT_CLASSNAME} ms-auto`}
                >
                  {t("common.connect")}
                </a>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[11px] leading-relaxed text-fg/30">
        {t("settings.socialManageNote")}
      </p>
    </GlassPanel>
  );
}

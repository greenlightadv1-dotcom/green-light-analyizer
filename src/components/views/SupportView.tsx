"use client";

import type { ReactNode } from "react";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import { useSupportOpenNow } from "@/components/support/useSupportOpenNow";
import { SUPPORT_EMAIL } from "@/lib/constants/legal";
import { SUPPORT_CHANNELS, type SupportChannelId } from "@/lib/support";

const ICONS: Record<SupportChannelId, ReactNode> = {
  email: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6 8.5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  discord: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <path d="M5 6.5c2-1.3 4-1.8 4-1.8l.6 1.2a14 14 0 0 1 4.8 0l.6-1.2s2 .5 4 1.8c1.6 2.8 2.3 6 2 9.6-1.8 1.4-3.6 2.2-5.3 2.6l-1-1.7M5 6.5c-1.6 2.8-2.3 6-2 9.6 1.8 1.4 3.6 2.2 5.3 2.6l1-1.7m-2.8-.8c3.1 1.6 7.9 1.6 11 0" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.3" cy="12.3" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="12.3" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  whatsapp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <path d="M4 20l1.2-3.6A8 8 0 1 1 8 19z" strokeLinejoin="round" />
      <path d="M9.2 8.8c.2 2.8 2.2 4.9 5 5.2l1-1.2-1.6-.9-.7.7c-.9-.4-1.7-1.2-2.1-2.1l.7-.7-.9-1.6z" strokeLinejoin="round" />
    </svg>
  ),
};

const KEYS: Record<SupportChannelId, { title: string; body: string; cta: string }> = {
  email: { title: "support.emailTitle", body: "support.emailBody", cta: "support.emailCta" },
  discord: { title: "support.discordTitle", body: "support.discordBody", cta: "support.discordCta" },
  whatsapp: { title: "support.whatsappTitle", body: "support.whatsappBody", cta: "support.whatsappCta" },
};

/**
 * Support & Help — the three published support channels and their hours
 * (lib/support.ts). Every destination comes from the constants the rest of
 * the product already uses; this page defines none of its own. Discord opens
 * the server invite, where tickets are raised: there is no in-app ticketing.
 */
export function SupportView() {
  const { t } = useTranslation();
  const openNow = useSupportOpenNow();

  return (
    <>
      <SectionHeader title={t("support.pageTitle")} description={t("support.pageDescription")} />

      <GlassPanel as="section" className="mb-4 p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-fg">{t("support.hoursTitle")}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-fg/65">{t("support.hours")}</p>
        <p className="mt-1 text-xs leading-relaxed text-fg/45">{t("support.hoursNote")}</p>
        {openNow === null ? null : (
          <p className={`mt-2 text-xs font-medium ${openNow ? "text-brand-green" : "text-fg/50"}`}>
            {openNow ? t("support.openNow") : t("support.closedNow")}
          </p>
        )}
      </GlassPanel>

      <ul className="grid gap-4 md:grid-cols-3">
        {SUPPORT_CHANNELS.map((channel) => {
          const keys = KEYS[channel.id];
          return (
            <li key={channel.id}>
              <GlassPanel className="flex h-full flex-col p-5 sm:p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-green/25 bg-brand-green/10 text-brand-green">
                  {ICONS[channel.id]}
                </span>
                <h2 className="mt-4 text-base font-semibold text-fg">{t(keys.title)}</h2>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-fg/60">{t(keys.body)}</p>
                {channel.id === "email" ? (
                  // The address itself, so it can be copied when no mail app is set up.
                  <p className="mt-3 text-xs break-all text-fg/50" dir="ltr">
                    {SUPPORT_EMAIL}
                  </p>
                ) : null}
                <a
                  href={channel.href}
                  data-support-channel={channel.id}
                  {...(channel.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-brand-green px-5 text-sm font-semibold text-ink transition hover:brightness-110"
                >
                  {t(keys.cta)}
                </a>
              </GlassPanel>
            </li>
          );
        })}
      </ul>
    </>
  );
}

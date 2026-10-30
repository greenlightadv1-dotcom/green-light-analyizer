"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useTranslation } from "@/components/LocaleProvider";
import type { HeldDeliveries, HeldReason } from "@/lib/email/held";

const REASON_KEYS: Record<HeldReason, string> = {
  bulk: "inbox.heldReasonBulk",
  noReply: "inbox.heldReasonNoReply",
  empty: "inbox.heldReasonEmpty",
  screened: "inbox.heldReasonScreened",
  forwardingConfirmation: "inbox.heldReasonForwarding",
};

function formatDate(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}

/**
 * "Where did my offer go?" — deliveries to the creator's alias that the
 * screener held back, so no deal room was opened.
 *
 * Collapsed to one line by default. It is reassurance, not a second inbox, and
 * nearly everything in it is a newsletter; it should not compete with the deal
 * list for attention. It renders nothing at all when there is nothing held.
 *
 * Every value shown here arrives pre-projected by lib/email/held.ts: the
 * subject already masked, the reason already folded into a category. This
 * component cannot see the raw row and has no way to un-mask anything — the
 * masking is not a rendering choice it could get wrong.
 *
 * The way out is the Manual Analyzer, not a reply. A held delivery has no
 * stored body (by design, §5), so it cannot be turned back into a deal room
 * here — but the creator still has the original in their own Gmail, and
 * pasting it into the analyzer opens a room on-platform. Offering the sender
 * address as the next step instead would point them off it.
 */
export function HeldDeliveriesPanel({ held }: { held: HeldDeliveries | null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const listId = useId();

  if (!held || held.items.length === 0) return null;

  const count = held.items.length;

  return (
    <GlassPanel className="mb-4 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg/70">
          {t("inbox.heldSummary", { count: held.truncated ? `${count}+` : count })}
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={listId}
          className="rounded-lg border border-fg/10 bg-fg/5 px-3 py-1.5 text-xs text-fg/70 transition hover:bg-fg/10 hover:text-fg"
        >
          {open ? t("inbox.heldHide") : t("inbox.heldShow")}
        </button>
      </div>

      {/*
        Always visible, not behind "Show": finishing Gmail forwarding setup
        is the one held item the creator has to act on (D4). Digits only —
        the server never shows or follows the confirmation link.
      */}
      {held.items
        .filter((item) => item.confirmationCode)
        .map((item) => (
          <p
            key={`code-${item.id}`}
            className="mt-3 rounded-xl border border-brand-green/25 bg-brand-green/10 px-3.5 py-2.5 text-sm text-fg/85"
          >
            {t("inbox.heldConfirmationCode", { code: item.confirmationCode ?? "" })}
          </p>
        ))}

      {open ? (
        <div id={listId} className="mt-4 border-t border-fg/8 pt-4">
          <p className="text-xs leading-relaxed text-fg/50">{t("inbox.heldIntro")}</p>

          <ul className="mt-4 space-y-2">
            {held.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 rounded-xl border border-fg/8 bg-fg/[0.03] px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg/85">
                    {item.subject || (
                      <span className="text-fg/40">{t("inbox.heldNoSubject")}</span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-fg/40">
                    {item.sender} · {formatDate(item.receivedAt)}
                  </p>
                  {item.subjectRedacted ? (
                    <p className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-200/70">
                      {t("inbox.heldRedacted")}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-full border border-fg/12 px-2.5 py-0.5 text-[11px] text-fg/55">
                  {t(REASON_KEYS[item.reason])}
                </span>
              </li>
            ))}
          </ul>

          {held.truncated ? (
            <p className="mt-3 text-[11px] text-fg/35">
              {t("inbox.heldTruncated", { count })}
            </p>
          ) : null}

          <Link
            href="/analyzer"
            className="mt-4 inline-flex rounded-lg border border-brand-green/30 bg-brand-green/10 px-3 py-1.5 text-xs font-medium text-brand-green transition hover:bg-brand-green/20"
          >
            {t("inbox.heldOpenAnalyzer")}
          </Link>
        </div>
      ) : null}
    </GlassPanel>
  );
}

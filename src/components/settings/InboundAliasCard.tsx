"use client";

import { useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";

/**
 * Email intake setup — CLAUDE.md §5.1–§5.2.
 *
 * The on-ramp to the whole pipeline: no forwarding rule, no offers, no deal
 * rooms. Worth being explicit that this is a one-time Gmail setting the creator
 * makes themselves — the app never connects to Gmail, never asks for Google
 * OAuth, and never touches the Gmail API. That is a deliberate design choice
 * (§5), not a limitation, and saying so heads off the obvious "why can't it
 * just link my inbox?" question.
 */

const STEPS = [
  "Open Gmail on a computer and go to Settings → See all settings → Forwarding and POP/IMAP.",
  "Click “Add a forwarding address”, paste the address above, and confirm.",
  "Gmail sends a confirmation code to Green Light. We accept it automatically — no action needed from you.",
  "Back in Gmail, choose “Forward a copy of incoming mail to” and pick that address.",
  "Optional but recommended: use Filters instead, so only business enquiries are forwarded rather than your whole inbox.",
];

export function InboundAliasCard({ alias }: { alias: string | null }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!alias) return;
    try {
      await navigator.clipboard.writeText(alias);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some browsers and every insecure origin. The
      // address is on screen and selectable, so this is not worth an error.
    }
  }

  return (
    <GlassPanel className="p-6">
      <h2 className="text-sm font-semibold text-white">Email intake</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-white/50">
        Forward your business email here and every offer arrives already priced
        and risk-rated.
      </p>

      {alias ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 rounded-xl border border-white/10 bg-navy-dark/70 px-3.5 py-2.5 font-mono text-sm break-all text-brand-green">
            {alias}
          </code>
          <button
            type="button"
            onClick={copy}
            className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-100">
          No inbound alias has been issued for this account yet. Ask an
          administrator to add one — offers cannot be received without it.
        </p>
      )}

      <ol className="mt-5 space-y-2.5">
        {STEPS.map((step, i) => (
          <li key={i} className="flex gap-3 text-xs leading-relaxed text-white/55">
            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/8 text-[10px] font-medium text-white/60">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      <p className="mt-5 border-t border-white/8 pt-4 text-[11px] leading-relaxed text-white/35">
        Your real email address never changes and never reaches a sponsor.
        Green Light does not connect to your Gmail account, does not ask for
        Google sign-in, and cannot read anything you have not forwarded.
      </p>
    </GlassPanel>
  );
}

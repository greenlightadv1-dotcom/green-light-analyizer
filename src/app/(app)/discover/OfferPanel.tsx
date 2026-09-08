"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { RiskBadge } from "@/components/deals/RiskBadge";
import {
  previewOfferToCreator,
  sendOfferToCreator,
  type OfferPreviewState,
} from "./actions";

const selectClass =
  "h-11 w-full rounded-xl border border-fg/10 bg-fg/5 px-3.5 text-sm text-fg transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none";

const TYPES = [
  { value: "video_dedicated", label: "Dedicated video" },
  { value: "integration", label: "Integration / segment" },
  { value: "post", label: "Post" },
  { value: "story_share", label: "Story share" },
  { value: "live_mention", label: "Live mention" },
  { value: "other", label: "Other" },
];

function PreviewButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} fullWidth={false}>
      {pending ? "Checking with the Co-Pilot…" : "Preview with Co-Pilot"}
    </Button>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant="ghost" fullWidth={false}>
      {pending ? "Sending…" : "Send this offer"}
    </Button>
  );
}

/**
 * Per-creator "send an offer" control on /discover (§3, §5.1).
 *
 * Two steps, deliberately mirroring the Manual Analyzer: `previewOfferToCreator`
 * only calls the Co-Pilot and returns a result, persisting nothing; a second,
 * explicit submit (`sendOfferToCreator`) is what actually opens the room. A
 * company should see the same price/risk read a creator would get pasting the
 * identical offer into their own analyzer, before committing to send it.
 */
export function OfferPanel({
  creatorId,
  creatorName,
}: {
  creatorId: string;
  creatorName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<OfferPreviewState, FormData>(
    previewOfferToCreator,
    { error: null, result: null },
  );

  if (!open) {
    return (
      <Button fullWidth={false} onClick={() => setOpen(true)}>
        Send an offer
      </Button>
    );
  }

  const r = state.result;

  return (
    <div className="w-full max-w-md space-y-3 rounded-2xl border border-fg/10 bg-fg/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-fg/60 uppercase">
          Offer to {creatorName}
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-fg/40 hover:text-fg/70"
        >
          Cancel
        </button>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="creator_id" value={creatorId} />
        <input type="hidden" name="creator_name" value={creatorName} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor={`sponsorship_type-${creatorId}`}
              className="block text-xs font-medium tracking-wide text-fg/70 uppercase"
            >
              What you want
            </label>
            <select
              id={`sponsorship_type-${creatorId}`}
              name="sponsorship_type"
              className={selectClass}
              required
              defaultValue="integration"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <Field
            id={`offered_amount-${creatorId}`}
            name="offered_amount"
            type="number"
            min="0"
            step="1"
            label="Your offer (USD)"
            placeholder="e.g. 1500"
          />
        </div>

        <Field
          id={`target_countries-${creatorId}`}
          name="target_countries"
          label="Target countries"
          placeholder="EG, SA, AE"
          hint="Optional. Two-letter codes, comma separated."
        />

        <div className="space-y-1.5">
          <label
            htmlFor={`message_text-${creatorId}`}
            className="block text-xs font-medium tracking-wide text-fg/70 uppercase"
          >
            Your message
          </label>
          <textarea
            id={`message_text-${creatorId}`}
            name="message_text"
            rows={4}
            maxLength={20000}
            required
            placeholder="Describe the deliverable, timeline and anything else the creator needs…"
            className="w-full resize-y rounded-xl border border-fg/10 bg-fg/5 px-3.5 py-2.5 text-sm text-fg placeholder:text-fg/30 transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none"
          />
        </div>

        {state.error ? <Alert>{state.error}</Alert> : null}

        <PreviewButton />
      </form>

      {r ? (
        <div className="space-y-3 border-t border-fg/8 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-fg">
              Co-Pilot recommendation
            </p>
            <RiskBadge risk={r.risk} capped={r.risk_capped} />
          </div>

          <p className="text-lg font-semibold text-fg tabular-nums">
            ${r.recommended_price_usd.toLocaleString("en-US")}{" "}
            <span className="text-xs font-normal text-fg/45">
              fair range ${r.price_range_usd.low.toLocaleString("en-US")}–$
              {r.price_range_usd.high.toLocaleString("en-US")}
            </span>
          </p>

          <p className="text-xs leading-relaxed text-fg/55">
            {r.reasoning}
          </p>

          {r.engine === "heuristic" ? (
            <p className="text-[11px] leading-relaxed text-fg/35">
              Rule-based estimate — the AI engine is not configured on this
              environment.
            </p>
          ) : null}

          <form action={sendOfferToCreator}>
            <input type="hidden" name="creator_id" value={r.creator_id} />
            <input type="hidden" name="offer_text" value={r.offer_text} />
            <input
              type="hidden"
              name="sponsorship_type"
              value={r.sponsorship_type}
            />
            <input
              type="hidden"
              name="target_countries"
              value={r.target_countries.join(",")}
            />
            <input type="hidden" name="risk" value={r.risk} />
            <input
              type="hidden"
              name="recommended_price_usd"
              value={r.recommended_price_usd}
            />
            <input
              type="hidden"
              name="offered_amount"
              value={r.offered_amount ?? ""}
            />
            <SendButton />
          </form>
        </div>
      ) : null}
    </div>
  );
}

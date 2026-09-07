"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { RiskBadge } from "@/components/deals/RiskBadge";
import {
  analyzeOffer,
  createDealFromAnalysis,
  type AnalyzerState,
} from "./actions";

const selectClass =
  "h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm text-white transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none";

/** §6.2 sponsorship_type, in the order a creator is most likely to need. */
const TYPES = [
  { value: "video_dedicated", label: "Dedicated video" },
  { value: "integration", label: "Integration / segment" },
  { value: "post", label: "Post" },
  { value: "story_share", label: "Story share" },
  { value: "live_mention", label: "Live mention" },
  { value: "other", label: "Other" },
];

function AnalyzeButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Analysing…" : "Analyse this offer"}
    </Button>
  );
}

/**
 * A canned result for the UI preview. Deliberately a capped one: §7.4 holding a
 * high-value deal at yellow on self-reported geography is the behaviour most
 * worth seeing, and the hardest to describe in words.
 */
const DEMO_RESULT: NonNullable<AnalyzerState["result"]> = {
  recommended_price_usd: 2100,
  price_range_usd: { low: 1700, high: 2600 },
  risk: "yellow",
  risk_capped: true,
  reasoning:
    "Reach and engagement support a figure well above the offer, and the sponsor's target markets overlap most of the audience. The rating is held below green only because that overlap is self-reported.",
  geo_basis: "declared",
  engine: "heuristic",
  sender_email: "growth@lumenapp.example",
  sponsorship_type: "integration",
  target_countries: ["SA"],
  offer_text: "",
};

export function AnalyzerForm({ demo = false }: { demo?: boolean }) {
  const [state, formAction] = useActionState<AnalyzerState, FormData>(
    analyzeOffer,
    { error: null, result: null },
  );
  const [demoResult, setDemoResult] = useState<AnalyzerState["result"]>(null);

  const r = demo ? demoResult : state.result;

  return (
    <div className="space-y-4">
      <GlassPanel className="p-6">
        <form
          action={demo ? undefined : formAction}
          onSubmit={
            demo
              ? (event) => {
                  event.preventDefault();
                  setDemoResult(DEMO_RESULT);
                }
              : undefined
          }
          className="space-y-4"
        >
          <Field
            id="sender_email"
            name="sender_email"
            type="email"
            label="Who sent it"
            placeholder="brand@company.com"
            required
          />

          <div className="space-y-1.5">
            <label
              htmlFor="message_text"
              className="block text-xs font-medium tracking-wide text-white/70 uppercase"
            >
              The offer
            </label>
            <textarea
              id="message_text"
              name="message_text"
              rows={7}
              maxLength={20000}
              required
              placeholder="Paste the full message you received…"
              className="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="sponsorship_type"
                className="block text-xs font-medium tracking-wide text-white/70 uppercase"
              >
                What they want
              </label>
              <select
                id="sponsorship_type"
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
              id="target_countries"
              name="target_countries"
              label="Target countries"
              placeholder="EG, SA, AE"
              hint="Optional. Two-letter codes, comma separated."
            />
          </div>

          {state.error ? <Alert>{state.error}</Alert> : null}

          <AnalyzeButton />
        </form>
      </GlassPanel>

      {r ? (
        <GlassPanel className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">Recommendation</h2>
            <RiskBadge risk={r.risk} capped={r.risk_capped} />
          </div>

          <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-3xl font-semibold text-white tabular-nums">
              ${r.recommended_price_usd.toLocaleString("en-US")}
            </p>
            <p className="text-sm text-white/45 tabular-nums">
              fair range ${r.price_range_usd.low.toLocaleString("en-US")}–$
              {r.price_range_usd.high.toLocaleString("en-US")}
            </p>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-white/60">
            {r.reasoning}
          </p>

          {r.risk_capped ? (
            <p className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
              Held at yellow: this is a high-value deal and the audience
              geography behind the rating is self-reported. Connect YouTube or
              Instagram analytics to let a deal like this rate green.
            </p>
          ) : null}

          {/*
            §5.4 names Gemini as the engine. When no key is configured the
            rule-based fallback answers instead, and saying so plainly is the
            point — presenting a heuristic as the AI Co-Pilot would be a lie
            about the one feature the product is sold on.
          */}
          {r.engine === "heuristic" ? (
            <p className="mt-3 text-[11px] leading-relaxed text-white/35">
              Rule-based estimate — the Gemini engine is not configured on this
              environment, so this is arithmetic on your reach and category, not
              an AI reading of the offer.
            </p>
          ) : null}

          <form
            action={demo ? undefined : createDealFromAnalysis}
            className="mt-5"
          >
            <input type="hidden" name="sender_email" value={r.sender_email} />
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
            <Button
              type={demo ? "button" : "submit"}
              variant="ghost"
              fullWidth={false}
            >
              Open a deal room for this offer
            </Button>
          </form>
        </GlassPanel>
      ) : null}
    </div>
  );
}

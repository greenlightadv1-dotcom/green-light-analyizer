"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { RiskBadge } from "@/components/deals/RiskBadge";
import { useTranslation } from "@/components/LocaleProvider";
import {
  analyzeOffer,
  createDealFromAnalysis,
  type AnalyzerState,
} from "./actions";

const selectClass =
  "h-11 w-full rounded-xl border border-fg/10 bg-fg/5 px-3.5 text-sm text-fg transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none";

/** Dark, readable regardless of theme — native <option> popups ignore the app's light/dark CSS variables in most browsers. */
const optionClass = "bg-slate-900 text-white dark:bg-slate-900 dark:text-white";

/** §6.2 sponsorship_type, in the order a creator is most likely to need. */
const TYPES = [
  { value: "video_dedicated", labelKey: "analyzer.typeVideoDedicated" },
  { value: "integration", labelKey: "analyzer.typeIntegration" },
  { value: "post", labelKey: "analyzer.typePost" },
  { value: "story_share", labelKey: "analyzer.typeStoryShare" },
  { value: "live_mention", labelKey: "analyzer.typeLiveMention" },
  { value: "other", labelKey: "analyzer.typeOther" },
] as const;

function AnalyzeButton() {
  const { pending } = useFormStatus();
  const { t } = useTranslation();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t("analyzer.analysing") : t("analyzer.analyzeButton")}
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
  security: {
    domain: "lumenapp.example",
    safeBrowsing: { flagged: false, threatTypes: [] },
    whois: {
      domain: "lumenapp.example",
      createdAt: "2019-03-11T00:00:00.000Z",
      expiresAt: "2027-03-11T00:00:00.000Z",
      registrantOrganization: "Lumen App Inc.",
      registrantName: "REDACTED FOR PRIVACY",
      registrantCountry: "US",
      whoisServer: "whois.example-registrar.com",
    },
    trustScore: 100,
    reasons: [],
  },
};

function trustScoreClass(score: number): string {
  if (score >= 80) {
    return "border-brand-green/30 bg-brand-green/10 text-brand-green";
  }
  if (score >= 50) {
    return "border-amber-300/30 bg-amber-300/10 text-amber-700 dark:text-amber-200";
  }
  return "border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-200";
}

export function AnalyzerForm({ demo = false }: { demo?: boolean }) {
  const { t } = useTranslation();
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
            label={t("analyzer.whoSentIt")}
            placeholder="brand@company.com"
            required
          />

          <div className="space-y-1.5">
            <label
              htmlFor="message_text"
              className="block text-xs font-medium tracking-wide text-fg/70 uppercase"
            >
              {t("analyzer.theOffer")}
            </label>
            <textarea
              id="message_text"
              name="message_text"
              rows={7}
              maxLength={20000}
              required
              placeholder={t("analyzer.offerPlaceholder")}
              className="w-full resize-y rounded-xl border border-fg/10 bg-fg/5 px-3.5 py-2.5 text-sm text-fg placeholder:text-fg/30 transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="sponsorship_type"
                className="block text-xs font-medium tracking-wide text-fg/70 uppercase"
              >
                {t("analyzer.whatTheyWant")}
              </label>
              <select
                id="sponsorship_type"
                name="sponsorship_type"
                className={selectClass}
                required
                defaultValue="integration"
              >
                {TYPES.map((type) => (
                  <option key={type.value} value={type.value} className={optionClass}>
                    {t(type.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <Field
              id="target_countries"
              name="target_countries"
              label={t("analyzer.targetCountries")}
              placeholder="EG, SA, AE"
              hint={t("analyzer.targetCountriesHint")}
            />
          </div>

          {state.error ? <Alert>{state.error}</Alert> : null}

          <AnalyzeButton />
        </form>
      </GlassPanel>

      {r ? (
        <GlassPanel className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-fg">{t("analyzer.recommendation")}</h2>
            <RiskBadge risk={r.risk} capped={r.risk_capped} />
          </div>

          <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-3xl font-semibold text-fg tabular-nums">
              ${r.recommended_price_usd.toLocaleString("en-US")}
            </p>
            <p className="text-sm text-fg/45 tabular-nums">
              {t("analyzer.fairRange", {
                low: r.price_range_usd.low.toLocaleString("en-US"),
                high: r.price_range_usd.high.toLocaleString("en-US"),
              })}
            </p>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-fg/60">
            {r.reasoning}
          </p>

          {r.risk_capped ? (
            <p className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-100">
              {t("analyzer.heldAtYellow")}
            </p>
          ) : null}

          {/*
            The engine is NVIDIA-hosted Kimi K3. When no key is configured the
            rule-based fallback answers instead, and saying so plainly is the
            point — presenting a heuristic as the AI Co-Pilot would be a lie
            about the one feature the product is sold on.
          */}
          {r.engine === "heuristic" ? (
            <p className="mt-3 text-[11px] leading-relaxed text-fg/35">
              {t("analyzer.ruleBasedEstimate")}
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
              {t("analyzer.openDealRoom")}
            </Button>
          </form>
        </GlassPanel>
      ) : null}

      {r?.security ? (
        <GlassPanel className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-fg">
              {t("analyzer.domainSecurityCheck")}
            </h2>
            {r.security.trustScore !== null ? (
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${trustScoreClass(r.security.trustScore)}`}
              >
                {t("analyzer.trustPercent", { score: r.security.trustScore })}
              </span>
            ) : (
              <span className="rounded-full border border-fg/15 px-2.5 py-1 text-xs text-fg/45">
                {t("analyzer.safetyScoreUnavailable")}
              </span>
            )}
          </div>

          <p className="mt-3 text-sm text-fg/60">
            {t("analyzer.domain")} <span className="text-fg">{r.security.domain}</span>
          </p>

          {r.security.reasons.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {r.security.reasons.map((reason) => (
                <li
                  key={reason}
                  className="rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-100"
                >
                  {reason}
                </li>
              ))}
            </ul>
          ) : null}

          {r.security.whois ? (
            <dl className="mt-4 grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-fg/45">
                  {t("analyzer.companyOrg")}
                </dt>
                <dd className="text-sm text-fg">
                  {r.security.whois.registrantOrganization ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg/45">{t("analyzer.registrantCountry")}</dt>
                <dd className="text-sm text-fg">
                  {r.security.whois.registrantCountry ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg/45">{t("analyzer.domainCreated")}</dt>
                <dd className="text-sm text-fg">
                  {r.security.whois.createdAt
                    ? new Date(r.security.whois.createdAt).toLocaleDateString()
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg/45">{t("analyzer.domainExpires")}</dt>
                <dd className="text-sm text-fg">
                  {r.security.whois.expiresAt
                    ? new Date(r.security.whois.expiresAt).toLocaleDateString()
                    : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-xs text-fg/40">
              {t("analyzer.whoisUnavailable")}
            </p>
          )}

          <div className="mt-4 space-y-1 border-t border-fg/8 pt-3">
            {r.security.whois?.whoisServer ? (
              <p className="text-[11px] text-fg/30">
                {t("analyzer.whoisSource", { server: r.security.whois.whoisServer })}
              </p>
            ) : null}
            {!r.security.safeBrowsing ? (
              <p className="text-[11px] text-fg/30">
                {t("analyzer.phishingCheckUnavailable")}
              </p>
            ) : null}
          </div>
        </GlassPanel>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { useTranslation } from "@/components/LocaleProvider";
import { ClassificationForm } from "@/components/onboarding/ClassificationForm";
import { CompanyDetailsForm, type CompanyInitial } from "@/components/onboarding/CompanyDetailsForm";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { AvatarUpload } from "@/components/uploads/AvatarUpload";
import { DocumentsUpload } from "@/components/uploads/DocumentsUpload";
import type { Onboarding, OnboardingStepId } from "@/lib/onboarding";

/**
 * "Get set up" (feature 2). The checklist is computed on the server from the
 * account's real data, so a returning user lands exactly where they left off;
 * steps that can be done here are inline, the rest link to their own page.
 */
export function OnboardingView({
  role,
  onboarding,
  avatarUrl,
  classification,
  company,
  representsCompany,
  demo = false,
  basePath = "",
}: {
  role: "creator" | "company" | "admin";
  onboarding: Onboarding;
  avatarUrl: string | null;
  classification: { categories: string[]; games: string[]; formats: string[] };
  company: CompanyInitial;
  representsCompany: string | null;
  demo?: boolean;
  basePath?: string;
}) {
  const { t } = useTranslation();
  const inline: Partial<Record<OnboardingStepId, ReactNode>> = {
    photo: <AvatarUpload initialUrl={avatarUrl} demo={demo} />,
    company_logo: <AvatarUpload initialUrl={avatarUrl} demo={demo} />,
    classification: <ClassificationForm initial={classification} demo={demo} />,
    company_details: <CompanyDetailsForm initial={company} demo={demo} />,
  };
  const pct = Math.round((onboarding.done / Math.max(1, onboarding.required)) * 100);

  return (
    <>
      <SectionHeader title={t("onboarding.title")} description={t(role === "creator" ? "onboarding.creatorIntro" : "onboarding.companyIntro")} />

      <GlassPanel as="section" className="mb-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-fg">
            {onboarding.complete ? t("onboarding.allDone") : t("onboarding.progress", { done: String(onboarding.done), total: String(onboarding.required) })}
          </span>
          <span className="text-fg/50">{pct}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-fg/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("onboarding.title")}>
          <div className="h-full bg-brand-green" style={{ width: `${pct}%` }} />
        </div>
        {role === "company" && !onboarding.steps.find((s) => s.id === "company_details")?.done ? (
          <p className="mt-3 text-xs text-fg/55">{t("onboarding.offersGated")}</p>
        ) : null}
        {representsCompany ? <p className="mt-3 text-xs text-fg/55">{t("onboarding.representing", { company: representsCompany })}</p> : null}
      </GlassPanel>

      <ol className="space-y-3">
        {onboarding.steps.map((step, i) => (
          <li key={step.id}>
            <GlassPanel className="p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    step.done ? "bg-brand-green text-ink" : "border border-fg/20 text-fg/60"
                  }`}
                >
                  {step.done ? "✓" : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-fg">
                    {t(`onboarding.step.${step.id}.title`)}
                    {step.optional ? <span className="ms-2 text-xs font-normal text-fg/45">{t("onboarding.optional")}</span> : null}
                    <span className="sr-only"> — {step.done ? t("onboarding.done") : t("onboarding.todo")}</span>
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-fg/60">{t(`onboarding.step.${step.id}.body`)}</p>
                  {inline[step.id] ? <div className="mt-4">{inline[step.id]}</div> : null}
                  {step.href && !inline[step.id] ? (
                    <Link href={`${basePath}${step.href}`} className="mt-3 inline-block text-sm font-medium text-brand-green underline-offset-2 hover:underline">
                      {t(`onboarding.step.${step.id}.cta`)} →
                    </Link>
                  ) : null}
                </div>
              </div>
            </GlassPanel>
          </li>
        ))}
      </ol>

      {role === "creator" ? (
        <GlassPanel as="section" className="mt-4 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-fg">{t("onboarding.documentsTitle")}</h2>
          <p className="mt-1 mb-4 text-sm text-fg/60">{t("onboarding.documentsBody")}</p>
          <DocumentsUpload demo={demo} />
        </GlassPanel>
      ) : null}
    </>
  );
}

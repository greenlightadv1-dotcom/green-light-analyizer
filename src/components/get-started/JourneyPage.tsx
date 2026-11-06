"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";
import type { Journey } from "@/lib/access-requests";
import { ApplicationForm } from "./ApplicationForm";

export function JourneyPage({ journey }: { journey: Journey }) {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-xl px-4 pt-12 pb-20 sm:px-6">
      <Link href="/get-started" className="text-xs text-ink/55 underline-offset-2 hover:underline dark:text-white/50">
        ← {t("getStarted.back")}
      </Link>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink sm:text-3xl dark:text-white">{t(`getStarted.journey.${journey}.title`)}</h1>
      <p className="mt-2 mb-6 text-sm leading-relaxed text-ink/60 dark:text-white/60">{t(`getStarted.journey.${journey}.formIntro`)}</p>
      <ApplicationForm journey={journey} />
      <ol className="mt-6 space-y-1 text-xs text-ink/50 dark:text-white/45">
        <li>1. {t("getStarted.next1")}</li>
        <li>2. {t("getStarted.next2")}</li>
        <li>3. {t("getStarted.next3")}</li>
      </ol>
    </section>
  );
}

"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/components/LocaleProvider";
import { saveBrief, type BriefFormState } from "@/app/(app)/collaborations/actions";
import { BRIEF_PLATFORMS, LIMITS, SPONSORSHIP_TYPES } from "@/lib/collab/rules";
import { PLATFORM_LABEL, TYPE_LABEL_KEY } from "@/lib/collab/display";
import { BRIEF_CATEGORY_KINDS, termsOf } from "@/lib/taxonomy";
import { useTaxonomy } from "@/components/TaxonomyProvider";
import type { Brief } from "@/lib/types/database";
import { BTN_PRIMARY, Labelled, SELECT_CLASS, TextArea, TextInput } from "./ui";

/**
 * Create or edit a brief. Saving a draft is not a consequential step (nothing
 * is visible to anyone else until it is published), so it submits directly;
 * publishing and archiving are separate confirmed actions.
 */
export function BriefForm({ brief }: { brief: Brief | null }) {
  const { t } = useTranslation();
  const taxonomy = useTaxonomy();
  const router = useRouter();
  const [state, action, pending] = useActionState<BriefFormState | null, FormData>(saveBrief, null);

  useEffect(() => {
    if (state?.ok && state.id && !brief) router.push(`/briefs/${state.id}`);
  }, [state, brief, router]);

  return (
    <form action={action} className="space-y-4">
      {brief ? <input type="hidden" name="brief_id" value={brief.id} /> : null}
      <TextInput id="brief-title" name="title" labelKey="collab.briefs.fieldTitle" required minLength={LIMITS.title[0]} maxLength={LIMITS.title[1]} defaultValue={brief?.title ?? ""} />
      <TextArea id="brief-description" name="description" labelKey="collab.briefs.fieldDescription" hintKey="collab.briefs.contactNote" required minLength={LIMITS.description[0]} maxLength={LIMITS.description[1]} rows={6} defaultValue={brief?.description ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Labelled id="brief-type" labelKey="collab.briefs.fieldType">
          <select id="brief-type" name="sponsorship_type" defaultValue={brief?.sponsorship_type ?? ""} className={SELECT_CLASS}>
            <option value="" className="bg-slate-900 text-white">{t("collab.briefs.fieldTypeAny")}</option>
            {SPONSORSHIP_TYPES.map((s) => (
              <option key={s} value={s} className="bg-slate-900 text-white">{t(TYPE_LABEL_KEY[s])}</option>
            ))}
          </select>
        </Labelled>
        <TextInput id="brief-countries" name="target_countries" labelKey="collab.briefs.fieldCountries" hintKey="collab.briefs.fieldCountriesHint" dir="ltr" maxLength={200} defaultValue={brief?.target_countries.join(", ") ?? ""} />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-fg-secondary">{t("collab.briefs.fieldPlatforms")}</legend>
        <div className="flex flex-wrap gap-2">
          {BRIEF_PLATFORMS.map((p) => (
            <label key={p} className="inline-flex items-center gap-2 rounded-chip border border-line px-3 py-1.5 text-sm text-fg">
              <input type="checkbox" name="platforms" value={p} defaultChecked={brief?.platforms.includes(p)} />
              {PLATFORM_LABEL[p]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-fg-secondary">{t("collab.briefs.fieldCategories")}</legend>
        <div className="flex flex-wrap gap-2">
          {termsOf(taxonomy.snap, BRIEF_CATEGORY_KINDS, { activeOnly: false })
            .filter((term) => term.active || brief?.categories.includes(term.id))
            .map(({ id: c }) => (
              <label key={c} className="inline-flex items-center gap-2 rounded-chip border border-line px-3 py-1.5 text-sm text-fg">
                <input type="checkbox" name="categories" value={c} defaultChecked={brief?.categories.includes(c)} />
                {taxonomy.label(c)}
              </label>
            ))}
        </div>
      </fieldset>
      <TextArea id="brief-summary" name="deliverables_summary" labelKey="collab.briefs.fieldSummary" maxLength={LIMITS.summary} rows={3} defaultValue={brief?.deliverables_summary ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput id="brief-min" name="budget_min_usd" labelKey="collab.briefs.fieldBudgetMin" inputMode="decimal" dir="ltr" defaultValue={brief?.budget_min_usd ?? ""} />
        <TextInput id="brief-max" name="budget_max_usd" labelKey="collab.briefs.fieldBudgetMax" inputMode="decimal" dir="ltr" defaultValue={brief?.budget_max_usd ?? ""} />
        <TextInput id="brief-start" name="start_date" type="date" labelKey="collab.briefs.fieldStart" defaultValue={brief?.start_date ?? ""} />
        <TextInput id="brief-due" name="due_date" type="date" labelKey="collab.briefs.fieldDue" defaultValue={brief?.due_date ?? ""} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? t("collab.briefs.saving") : t("collab.briefs.save")}
        </button>
        {state && !state.ok && state.errorKey ? (
          <p role="alert" className="text-sm text-danger">{t(state.errorKey)}</p>
        ) : null}
        {state?.ok && brief ? <p role="status" className="text-sm text-success">{t("collab.briefs.saved")}</p> : null}
      </div>
    </form>
  );
}

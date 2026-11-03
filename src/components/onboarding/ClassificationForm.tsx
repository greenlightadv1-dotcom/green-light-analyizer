"use client";

import { useActionState, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { saveClassification, type SaveState } from "@/app/(app)/onboarding/actions";
import { useTaxonomy } from "@/components/TaxonomyProvider";
import { TAXONOMY_LIMITS, termsOf, type TaxonomySnapshot, type TermKind } from "@/lib/taxonomy";

type Initial = { categories: string[]; games: string[]; formats: string[]; tags?: string[] };

/** Active terms of a kind, plus any deactivated one this creator already holds (kept, never silently dropped). */
function optionIds(snap: TaxonomySnapshot, kinds: TermKind | TermKind[], held: string[]): string[] {
  return termsOf(snap, kinds, { activeOnly: false }).filter((t) => t.active || held.includes(t.id)).map((t) => t.id);
}

function Chips({
  name,
  options,
  label,
  selected,
  max,
  onChange,
}: {
  name: string;
  options: { id: string; label: string }[];
  label: string;
  selected: string[];
  max: number;
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset>
      <legend className="text-xs font-medium tracking-wide text-fg/70 uppercase">
        {label} <span className="normal-case text-fg-muted">{t("onboarding.upTo", { n: String(max) })}</span>
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o.id);
          const full = !on && selected.length >= max;
          return (
            <label
              key={o.id}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-green
                ${on ? "border-brand-green/60 bg-brand-green/15 text-fg" : "border-fg/15 bg-fg/5 text-fg/70 hover:border-fg/30"}
                ${full ? "cursor-not-allowed opacity-40" : ""}`}
            >
              <input
                type="checkbox"
                name={name}
                value={o.id}
                checked={on}
                disabled={full}
                className="sr-only"
                onChange={() => onChange(on ? selected.filter((x) => x !== o.id) : [...selected, o.id])}
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Creator classification: the admin-managed taxonomy only (0033). */
export function ClassificationForm({ initial, demo = false }: { initial: Initial; demo?: boolean }) {
  const { t } = useTranslation();
  const { snap, label } = useTaxonomy();
  const [state, action, pending] = useActionState<SaveState, FormData>(saveClassification, { error: null, saved: false });
  const [cats, setCats] = useState(initial.categories);
  const [games, setGames] = useState(initial.games);
  const [formats, setFormats] = useState(initial.formats);
  const [tags, setTags] = useState(initial.tags ?? []);
  const gaming = cats.includes("gaming") || cats.includes("esports") || games.length > 0;
  // Games are grouped under their genre so a long list stays scannable.
  const genres = termsOf(snap, "genre");
  const gameIds = optionIds(snap, "game", initial.games);
  const parentOf = (id: string) => snap.terms.find((x) => x.id === id)?.parent_id ?? null;
  const ungrouped = gameIds.filter((g) => !genres.some((ge) => ge.id === parentOf(g)));
  const tagKinds = (["sport", "specialization", "interest"] as const).filter((k) => optionIds(snap, k, initial.tags ?? []).length > 0);
  const opts = (ids: string[]) => ids.map((id) => ({ id, label: label(id) }));

  return (
    <form action={action} className="space-y-5">
      <Chips name="categories" label={t("onboarding.categories")} max={TAXONOMY_LIMITS.categories} selected={cats} onChange={setCats} options={opts(optionIds(snap, "category", initial.categories))} />
      {gaming ? (
        <div className="space-y-3">
          {genres.map((ge) => {
            const ids = gameIds.filter((g) => parentOf(g) === ge.id);
            return ids.length ? (
              <Chips key={ge.id} name="games" label={`${t("onboarding.games")} · ${label(ge.id)}`} max={TAXONOMY_LIMITS.games} selected={games} onChange={setGames} options={opts(ids)} />
            ) : null;
          })}
          {ungrouped.length ? <Chips name="games" label={t("onboarding.games")} max={TAXONOMY_LIMITS.games} selected={games} onChange={setGames} options={opts(ungrouped)} /> : null}
        </div>
      ) : null}
      <Chips name="formats" label={t("onboarding.formats")} max={TAXONOMY_LIMITS.formats} selected={formats} onChange={setFormats} options={opts(optionIds(snap, "format", initial.formats))} />
      {tagKinds.map((k) => (
        <Chips key={k} name="tags" label={t(`onboarding.tagKind.${k}`)} max={TAXONOMY_LIMITS.tags} selected={tags} onChange={setTags} options={opts(optionIds(snap, k, initial.tags ?? []))} />
      ))}
      {state.error ? <Alert>{t(`onboarding.error.${state.error}`)}</Alert> : null}
      {state.saved ? <Alert tone="info">{t("onboarding.saved")}</Alert> : null}
      <Button type="submit" fullWidth={false} disabled={pending || demo || cats.length === 0}>
        {pending ? t("onboarding.saving") : t("onboarding.save")}
      </Button>
    </form>
  );
}

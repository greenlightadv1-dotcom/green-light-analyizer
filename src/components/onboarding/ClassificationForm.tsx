"use client";

import { useActionState, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { saveClassification, type SaveState } from "@/app/(app)/onboarding/actions";
import { CONTENT_CATEGORIES, CONTENT_FORMATS, GAMES, GAME_IDS, TAXONOMY_LIMITS } from "@/lib/taxonomy";

type Initial = { categories: string[]; games: string[]; formats: string[] };

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
        {label} <span className="normal-case text-fg/45">{t("onboarding.upTo", { n: String(max) })}</span>
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

/** Creator classification (feature 3) — controlled taxonomy only. */
export function ClassificationForm({ initial, demo = false }: { initial: Initial; demo?: boolean }) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState<SaveState, FormData>(saveClassification, { error: null, saved: false });
  const [cats, setCats] = useState(initial.categories);
  const [games, setGames] = useState(initial.games);
  const [formats, setFormats] = useState(initial.formats);

  return (
    <form action={action} className="space-y-5">
      <Chips
        name="categories"
        label={t("onboarding.categories")}
        max={TAXONOMY_LIMITS.categories}
        selected={cats}
        onChange={setCats}
        options={CONTENT_CATEGORIES.map((id) => ({ id, label: t(`taxonomy.category.${id}`) }))}
      />
      {cats.includes("gaming") || cats.includes("esports") || games.length > 0 ? (
        <Chips
          name="games"
          label={t("onboarding.games")}
          max={TAXONOMY_LIMITS.games}
          selected={games}
          onChange={setGames}
          options={GAME_IDS.map((id) => ({ id, label: id === "variety" || id === "other_game" || id === "just_chatting" ? t(`taxonomy.game.${id}`) : GAMES[id] }))}
        />
      ) : null}
      <Chips
        name="formats"
        label={t("onboarding.formats")}
        max={TAXONOMY_LIMITS.formats}
        selected={formats}
        onChange={setFormats}
        options={CONTENT_FORMATS.map((id) => ({ id, label: t(`taxonomy.format.${id}`) }))}
      />
      {state.error ? <Alert>{t(`onboarding.error.${state.error}`)}</Alert> : null}
      {state.saved ? <Alert tone="info">{t("onboarding.saved")}</Alert> : null}
      <Button type="submit" fullWidth={false} disabled={pending || demo || cats.length === 0}>
        {pending ? t("onboarding.saving") : t("onboarding.save")}
      </Button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import type { TaxonomyTerm, TermKind } from "@/lib/taxonomy";
import { deleteTerm, saveTerm, type TermState } from "./actions";

const field = "h-9 w-full rounded-control border border-line bg-surface-muted px-2.5 text-sm text-fg";
const KINDS: TermKind[] = ["category", "genre", "game", "sport", "format", "interest", "specialization", "campaign_category"];

/** Add or edit one term. Admin console copy is English, like the rest of /admin. */
export function TermForm({ term, parents, usage }: { term: TaxonomyTerm | null; parents: TaxonomyTerm[]; usage?: number }) {
  const [state, action, pending] = useActionState<TermState | null, FormData>(saveTerm, null);
  const [delState, del, deleting] = useActionState<TermState | null, FormData>(deleteTerm, null);
  const create = term === null;
  return (
    <div className="space-y-2">
      <form action={action} className="grid gap-2 sm:grid-cols-6">
        <input type="hidden" name="mode" value={create ? "create" : "update"} />
        <label className="text-xs text-fg-muted sm:col-span-2">Id (stable, never changes)
          <input name="id" defaultValue={term?.id ?? ""} readOnly={!create} required pattern="[a-z0-9_]{2,40}" className={`${field} mt-1 ${create ? "" : "opacity-70"}`} dir="ltr" />
        </label>
        <label className="text-xs text-fg-muted">Kind
          {create ? (
            <select name="kind" required className={`${field} mt-1`} defaultValue="sport">
              {KINDS.map((k) => <option key={k} value={k} className="bg-slate-900 text-white">{k.replace(/_/g, " ")}</option>)}
            </select>
          ) : (
            <input name="kind" defaultValue={term.kind} readOnly className={`${field} mt-1 opacity-70`} />
          )}
        </label>
        <label className="text-xs text-fg-muted">Parent
          <select name="parent_id" defaultValue={term?.parent_id ?? ""} className={`${field} mt-1`}>
            <option value="" className="bg-slate-900 text-white">None</option>
            {parents.filter((p) => p.id !== term?.id).map((p) => <option key={p.id} value={p.id} className="bg-slate-900 text-white">{p.label_en} ({p.kind})</option>)}
          </select>
        </label>
        <label className="text-xs text-fg-muted">Order
          <input name="sort_order" type="number" min={0} max={10000} defaultValue={term?.sort_order ?? 100} className={`${field} mt-1`} />
        </label>
        <label className="flex items-end gap-2 pb-2 text-xs text-fg">
          <input name="active" type="checkbox" defaultChecked={term?.active ?? true} /> Active (shown in pickers)
        </label>
        <label className="text-xs text-fg-muted sm:col-span-3">English label
          <input name="label_en" defaultValue={term?.label_en ?? ""} required maxLength={80} className={`${field} mt-1`} />
        </label>
        <label className="text-xs text-fg-muted sm:col-span-3">Arabic label
          <input name="label_ar" defaultValue={term?.label_ar ?? ""} required maxLength={80} dir="rtl" className={`${field} mt-1`} />
        </label>
        <label className="text-xs text-fg-muted sm:col-span-3">English description (optional)
          <input name="description_en" defaultValue={term?.description_en ?? ""} maxLength={300} className={`${field} mt-1`} />
        </label>
        <label className="text-xs text-fg-muted sm:col-span-3">Arabic description (optional)
          <input name="description_ar" defaultValue={term?.description_ar ?? ""} maxLength={300} dir="rtl" className={`${field} mt-1`} />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
          <button type="submit" disabled={pending} className="h-9 rounded-chip bg-brand-green px-3 text-xs font-semibold text-ink disabled:opacity-50">{pending ? "Saving…" : create ? "Add term" : "Save"}</button>
          {state?.message ? <span role={state.ok ? "status" : "alert"} className={`text-xs ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</span> : null}
        </div>
      </form>
      {!create ? (
        <form action={del} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={term.id} />
          <span className="text-xs text-fg-muted">Used by {usage ?? 0} {usage === 1 ? "record" : "records"} (profiles, briefs, child terms).</span>
          {usage === 0 ? (
            <button type="submit" disabled={deleting} className="h-8 rounded-chip border border-danger/40 px-3 text-xs text-danger disabled:opacity-50">Delete (unused)</button>
          ) : (
            <span className="text-xs text-fg-muted">In use: deactivate instead of deleting.</span>
          )}
          {delState?.message ? <span role={delState.ok ? "status" : "alert"} className={`text-xs ${delState.ok ? "text-success" : "text-danger"}`}>{delState.message}</span> : null}
        </form>
      ) : null}
    </div>
  );
}

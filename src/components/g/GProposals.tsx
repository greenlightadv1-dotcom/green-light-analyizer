"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { CopyButton } from "@/components/ui/CopyButton";
import { createBriefDraft, inviteCreator } from "@/app/(app)/collaborations/actions";
import { saveContentItem } from "@/app/(app)/content/actions";
import type { CollabSummary, GProposal, InvitationSummary, OpportunityMatch } from "@/lib/g/collab";
import { day, usd } from "@/lib/collab/display";

/**
 * G's collaboration and content cards, and its prepared proposals.
 *
 * A proposal is a form G filled in. Nothing runs until the person edits it as
 * they wish, presses the button, and confirms in the dialog; the form then
 * calls the same server action the product's own pages use, which re-checks
 * role, ownership, masking and rate limits. A message draft is only copied:
 * messages are sent from the deal room by the person.
 */

const field =
  "w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-xs text-fg focus:border-forest focus:ring-2 focus:ring-brand-green/30 focus:outline-none dark:focus:border-brand-green";
const btn =
  "inline-flex items-center rounded-full bg-forest px-4 py-1.5 text-xs font-semibold text-white hover:bg-forest-strong focus-visible:focus-ring dark:bg-brand-green dark:text-ink";

export function CollaborationsCard({
  data,
  basePath = "",
}: {
  data: { items: CollabSummary[]; invitations: InvitationSummary[]; briefs?: { id: string; title: string; status: string }[] };
  basePath?: string;
}) {
  const { t } = useTranslation();
  const pending = data.invitations.filter((i) => i.status === "pending");
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface-soft p-3.5 text-xs">
      <p className="font-semibold text-fg">{t("g.collab.title")}</p>
      {pending.length ? <p className="text-fg-secondary">{t("g.collab.pendingInvitations", { count: pending.length })}</p> : null}
      {data.briefs?.length ? (
        <p className="text-fg-secondary">{t("g.collab.briefs", { published: data.briefs.filter((b) => b.status === "published").length, total: data.briefs.length })}</p>
      ) : null}
      {data.items.length === 0 ? (
        <p className="text-fg-muted">{t("g.collab.none")}</p>
      ) : (
        <ul className="space-y-1.5">
          {data.items.slice(0, 5).map((c) => (
            <li key={c.id}>
              <Link href={`${basePath}/collaborations/${c.id}`} className="block rounded-lg px-1 py-0.5 hover:bg-surface-hover focus-visible:focus-ring">
                <span dir="auto" className="font-medium text-fg">{c.title || "—"}</span>
                <span className="text-fg-muted"> · {t(`collab.status.${c.status}`)}</span>
                {c.agreed_amount_usd !== null ? <span className="text-fg-muted"> · {usd(c.agreed_amount_usd)}</span> : null}
                <span className="block text-fg-secondary">{t(`g.next.${c.next}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ContentCard({ data }: { data: { counts: Record<string, number>; upcoming: { id: string; kind: string; title: string; planned_for: string }[] } }) {
  const { t } = useTranslation();
  const statuses = ["idea", "drafting", "ready", "scheduled"];
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface-soft p-3.5 text-xs">
      <p className="font-semibold text-fg">{t("content.title")}</p>
      <p className="text-fg-secondary">{statuses.map((s) => `${t(`content.status.${s}`)}: ${data.counts[s] ?? 0}`).join(" · ")}</p>
      {data.upcoming.length ? (
        <ul className="space-y-0.5">
          {data.upcoming.map((u) => (
            <li key={u.id} className="text-fg">
              {day(u.planned_for)} · <span dir="auto">{u.title}</span> <span className="text-fg-muted">({t(`content.kind.${u.kind}`)})</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted">{t("g.contentNoUpcoming")}</p>
      )}
    </div>
  );
}

export function ProposalCard({ p, basePath = "", demo = false }: { p: GProposal; basePath?: string; demo?: boolean }) {
  const { t } = useTranslation();
  const frame = "space-y-2.5 rounded-2xl border-2 border-brand-green/60 bg-surface p-3.5 text-xs";
  const head = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-lime-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">{t(`g.proposal.${p.type}`)}</span>
      <span className="text-fg-muted">{t("g.proposal.notYet")}</span>
    </div>
  );
  if (p.type === "message_draft") {
    return (
      <div className={frame}>
        {head}
        <p dir="auto" className="whitespace-pre-wrap text-fg">{p.text}</p>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={p.text} />
          <Link href={`${basePath}/collaborations/${p.collaboration_id}`} className={btn}>{t("g.action.open_collaboration")} →</Link>
        </div>
        <p className="text-fg-muted">{t("g.proposal.messageHint")}</p>
      </div>
    );
  }
  if (p.type === "content_draft") {
    return (
      <div className={frame}>
        {head}
        <ConfirmActionForm
          action={demo ? async () => ({ ok: false, errorKey: "g.proposal.demo" }) : saveContentItem}
          hidden={{ status: "drafting" }}
          trigger={{ labelKey: "g.proposal.saveDraft" }}
          triggerClassName={`${btn} disabled:cursor-default disabled:opacity-60`}
          once
          titleKey="g.proposal.saveTitle"
          bodyKey="g.proposal.saveBody"
          confirmKey="g.proposal.saveConfirm"
          successKey="g.proposal.saved"
          className="space-y-2"
        >
          <input type="hidden" name="kind" value={p.kind} />
          <label className="block text-fg-muted">{t(`content.kind.${p.kind}`)}
            <input name="title" required maxLength={160} defaultValue={p.title} dir="auto" className={`${field} mt-1`} />
          </label>
          <textarea name="body" aria-label={t("content.fieldBody")} rows={5} maxLength={20000} defaultValue={p.body} dir="auto" className={field} />
        </ConfirmActionForm>
      </div>
    );
  }
  if (p.type === "brief_draft") {
    const criteria = [
      ...p.platforms.map((x) => x),
      ...p.categories.map((x) => x.replace(/_/g, " ")),
      ...p.target_countries,
    ];
    return (
      <div className={frame}>
        {head}
        <ConfirmActionForm
          action={demo ? async () => ({ ok: false, errorKey: "g.proposal.demo" }) : createBriefDraft}
          hidden={{}}
          trigger={{ labelKey: "g.proposal.saveBriefDraft" }}
          triggerClassName={`${btn} disabled:cursor-default disabled:opacity-60`}
          once
          titleKey="g.proposal.briefTitle"
          bodyKey="g.proposal.briefBody"
          confirmKey="g.proposal.briefConfirm"
          successKey="g.proposal.briefSaved"
          className="space-y-2"
        >
          {p.platforms.map((x) => <input key={`p-${x}`} type="hidden" name="platforms" value={x} />)}
          {p.categories.map((x) => <input key={`c-${x}`} type="hidden" name="categories" value={x} />)}
          <input type="hidden" name="target_countries" value={p.target_countries.join(",")} />
          <label className="block text-fg-muted">{t("collab.briefs.fieldTitle")}
            <input name="title" required minLength={3} maxLength={120} defaultValue={p.title} dir="auto" className={`${field} mt-1`} />
          </label>
          <label className="block text-fg-muted">{t("collab.briefs.fieldDescription")}
            <textarea name="description" required minLength={10} maxLength={5000} rows={4} defaultValue={p.description} dir="auto" className={`${field} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-fg-muted">{t("collab.briefs.fieldBudgetMin")}
              <input name="budget_min_usd" type="number" min={0} defaultValue={p.budget_min_usd ?? ""} dir="ltr" className={`${field} mt-1`} />
            </label>
            <label className="block text-fg-muted">{t("collab.briefs.fieldBudgetMax")}
              <input name="budget_max_usd" type="number" min={0} defaultValue={p.budget_max_usd ?? ""} dir="ltr" className={`${field} mt-1`} />
            </label>
          </div>
          {criteria.length ? <p className="text-fg-secondary">{t("g.proposal.briefCriteria", { list: criteria.join(", ") })}</p> : null}
        </ConfirmActionForm>
        <p className="text-fg-muted">{t("g.proposal.briefHint")}</p>
      </div>
    );
  }
  return (
    <div className={frame}>
      {head}
      <p className="text-fg-secondary">{t("g.proposal.to", { name: p.creator_name ?? "—" })}</p>
      <ConfirmActionForm
        action={demo ? async () => ({ ok: false, errorKey: "g.proposal.demo" }) : inviteCreator}
        hidden={{ brief_id: p.brief_id, creator_id: p.creator_id }}
        trigger={{ labelKey: "g.proposal.sendInvitation" }}
        triggerClassName={`${btn} disabled:cursor-default disabled:opacity-60`}
          once
        titleKey="g.proposal.inviteTitle"
        bodyKey="g.proposal.inviteBody"
        confirmKey="g.proposal.inviteConfirm"
        successKey="collab.invite.sent"
        className="space-y-2"
      >
        <textarea name="message" aria-label={t("collab.invite.message")} required rows={4} maxLength={2000} defaultValue={p.message} dir="auto" className={field} />
      </ConfirmActionForm>
    </div>
  );
}

export function OpportunitiesCard({
  data,
  basePath = "",
}: {
  data: { items: OpportunityMatch[]; published: number };
  basePath?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface-soft p-3.5 text-xs">
      <p className="font-semibold text-fg">{t("g.opp.title")}</p>
      <p className="text-fg-muted">{t("g.opp.basis", { count: data.published })}</p>
      {data.items.length === 0 ? <p className="text-fg-muted">{t("g.opp.none")}</p> : null}
      <ul className="space-y-2">
        {data.items.map((o) => (
          <li key={o.brief_id} className="rounded-xl border border-line bg-surface p-2.5">
            <p dir="auto" className="font-semibold text-fg">{o.title || "—"}</p>
            <ul className="mt-1 space-y-0.5 text-fg-secondary">
              {o.matched.map((m) => (
                <li key={m.kind}>✓ {t(`g.opp.match.${m.kind}`, { values: m.values.map((v) => v.replace(/_/g, " ")).join(", ") })}</li>
              ))}
              {o.unmatched.map((k) => (
                <li key={k} className="text-fg-muted">✗ {t(`g.opp.miss.${k}`)}</li>
              ))}
            </ul>
            {o.budget_min_usd !== null || o.budget_max_usd !== null ? (
              <p className="mt-1 text-fg-muted">
                {t("g.opp.budget", { range: [o.budget_min_usd, o.budget_max_usd].filter((v) => v !== null).map((v) => usd(v as number)).join(" – ") })}
              </p>
            ) : null}
            {o.invited ? <p className="mt-1 font-medium text-accent">{t("g.opp.invited")}</p> : null}
          </li>
        ))}
      </ul>
      <Link href={`${basePath}/opportunities`} className={btn}>{t("g.action.open_opportunities")} →</Link>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { CopyButton } from "@/components/ui/CopyButton";
import { inviteCreator } from "@/app/(app)/collaborations/actions";
import { saveContentItem } from "@/app/(app)/content/actions";
import type { CollabSummary, GProposal, InvitationSummary } from "@/lib/g/collab";
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
  "w-full rounded-lg border border-line bg-surface-muted px-2.5 py-1.5 text-xs text-fg focus:border-brand-green/50 focus:outline-none";
const btn =
  "rounded-full border border-brand-green/30 bg-brand-green/10 px-3 py-1 text-[11px] font-medium text-brand-green hover:bg-brand-green/20 focus-visible:focus-ring";

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
    <div className="space-y-2 rounded-xl border border-line bg-surface-muted p-3 text-xs">
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
    <div className="space-y-2 rounded-xl border border-line bg-surface-muted p-3 text-xs">
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
  const frame = "space-y-2 rounded-xl border border-brand-green/30 bg-brand-green/5 p-3 text-xs";
  const head = (
    <p className="font-semibold text-fg">
      {t(`g.proposal.${p.type}`)} <span className="font-normal text-fg-muted">· {t("g.proposal.notYet")}</span>
    </p>
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
          triggerClassName={btn}
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
  return (
    <div className={frame}>
      {head}
      <p className="text-fg-secondary">{t("g.proposal.to", { name: p.creator_name ?? "—" })}</p>
      <ConfirmActionForm
        action={demo ? async () => ({ ok: false, errorKey: "g.proposal.demo" }) : inviteCreator}
        hidden={{ brief_id: p.brief_id, creator_id: p.creator_id }}
        trigger={{ labelKey: "g.proposal.sendInvitation" }}
        triggerClassName={btn}
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

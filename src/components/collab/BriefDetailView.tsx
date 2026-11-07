"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { archiveBrief, inviteCreator, publishBrief, reviseInvitation, withdrawInvitation } from "@/app/(app)/collaborations/actions";
import { briefActions, invitationActions, LIMITS } from "@/lib/collab/rules";
import { day, usd } from "@/lib/collab/display";
import type { Brief, Invitation } from "@/lib/types/database";
import { BriefForm } from "./BriefForm";
import { BriefSummary } from "./BriefSummary";
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, Status, TextArea, TextInput } from "./ui";

export type InviteCandidate = { creator_id: string; full_name: string; platforms: string[] };

/** A company's own brief: edit, publish, archive, invite and manage invitations. */
export function BriefDetailView({
  brief,
  invitations,
  names,
  collaborationByInvitation,
  query,
  candidates,
  detailsComplete,
}: {
  brief: Brief;
  invitations: Invitation[];
  names: Record<string, string>;
  collaborationByInvitation: Record<string, string>;
  query: string;
  candidates: InviteCandidate[];
  detailsComplete: boolean;
}) {
  const { t } = useTranslation();
  const can = briefActions(brief.status);

  return (
    <>
      <Link href="/briefs" className="mb-3 inline-block text-xs text-fg-muted hover:text-fg focus-visible:focus-ring">← {t("collab.briefs.back")}</Link>
      <SectionHeader title={brief.title} action={<Status status={brief.status} />} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <GlassPanel className="p-5">
            {can.edit ? (
              <>
                <h2 className="mb-4 text-sm font-semibold text-fg">{t("collab.briefs.edit")}</h2>
                <BriefForm brief={brief} />
              </>
            ) : (
              <BriefSummary brief={brief} />
            )}
          </GlassPanel>

          <GlassPanel className="overflow-hidden">
            <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-fg">{t("collab.briefs.invitations")}</h2>
            {invitations.length === 0 ? (
              <p className="px-5 py-6 text-sm text-fg-muted">{t("collab.briefs.noInvitations")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {invitations.map((inv) => {
                  const a = invitationActions("company", inv.status);
                  const collabId = collaborationByInvitation[inv.id];
                  return (
                    <li key={inv.id} className="space-y-2 px-5 py-4 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-fg">{names[inv.creator_id] ?? "—"}</span>
                        <Status status={inv.status} />
                      </div>
                      <p className="text-xs text-fg-muted">
                        {day(inv.created_at)}
                        {inv.proposed_amount_usd !== null ? ` · ${t("collab.opp.proposed", { amount: usd(inv.proposed_amount_usd) })}` : ""}
                      </p>
                      <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere] text-fg-secondary">{inv.message}</p>
                      {inv.response_note ? (
                        <div className="rounded-control border border-line bg-surface-muted p-3">
                          <p className="text-xs text-fg-muted">{t("collab.invite.creatorNote")}</p>
                          <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere] text-fg">{inv.response_note}</p>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {collabId ? (
                          <Link href={`/collaborations/${collabId}`} className={BTN_GHOST}>{t("collab.opp.openCollaboration")}</Link>
                        ) : null}
                        {a.withdraw ? (
                          <ConfirmActionForm
                            action={withdrawInvitation}
                            hidden={{ invitation_id: inv.id }}
                            trigger={{ labelKey: "collab.invite.withdraw" }}
                            triggerClassName={BTN_DANGER}
                            titleKey="collab.invite.withdrawTitle"
                            bodyKey="collab.invite.withdrawBody"
                            confirmKey="collab.invite.withdrawConfirm"
                            successKey="collab.invite.withdrawn"
                            tone="danger"
                            className="flex flex-wrap items-center gap-2"
                          />
                        ) : null}
                      </div>
                      {a.revise ? (
                        <ConfirmActionForm
                          action={reviseInvitation}
                          hidden={{ invitation_id: inv.id }}
                          trigger={{ labelKey: "collab.invite.revise" }}
                          triggerClassName={BTN_PRIMARY}
                          titleKey="collab.invite.reviseTitle"
                          bodyKey="collab.invite.reviseBody"
                          confirmKey="collab.invite.reviseConfirm"
                          successKey="collab.invite.revised"
                          className="space-y-3 rounded-control border border-line p-3"
                        >
                          <TextArea id={`rev-msg-${inv.id}`} name="message" labelKey="collab.invite.message" required maxLength={LIMITS.message} rows={3} defaultValue={inv.message} />
                          <TextInput id={`rev-amt-${inv.id}`} name="amount" labelKey="collab.invite.amount" inputMode="decimal" dir="ltr" defaultValue={inv.proposed_amount_usd ?? ""} />
                        </ConfirmActionForm>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassPanel>
        </div>

        <div className="space-y-4">
          <GlassPanel className="space-y-3 p-5">
            {can.publish ? (
              <>
                {!detailsComplete ? <p className="text-xs text-warning">{t("collab.errors.company_details")}</p> : null}
                <ConfirmActionForm
                  action={publishBrief}
                  hidden={{ brief_id: brief.id }}
                  trigger={{ labelKey: "collab.briefs.publish" }}
                  triggerClassName={BTN_PRIMARY}
                  titleKey="collab.briefs.publishTitle"
                  bodyKey="collab.briefs.publishBody"
                  confirmKey="collab.briefs.publishConfirm"
                  className="flex flex-wrap items-center gap-2"
                />
              </>
            ) : null}
            {can.archive ? (
              <ConfirmActionForm
                action={archiveBrief}
                hidden={{ brief_id: brief.id }}
                trigger={{ labelKey: "collab.briefs.archive" }}
                triggerClassName={BTN_GHOST}
                titleKey="collab.briefs.archiveTitle"
                bodyKey="collab.briefs.archiveBody"
                confirmKey="collab.briefs.archiveConfirm"
                tone="danger"
                className="flex flex-wrap items-center gap-2"
              />
            ) : null}
            <p className="text-xs leading-relaxed text-fg-muted">{t("collab.c.commissionNote")}</p>
          </GlassPanel>

          <GlassPanel className="space-y-3 p-5">
            <h2 className="text-sm font-semibold text-fg">{t("collab.invite.title")}</h2>
            {!can.invite ? (
              <p className="text-sm text-fg-muted">{t("collab.invite.needsDetails")}</p>
            ) : (
              <>
                <form method="get" className="flex gap-2" role="search">
                  <label htmlFor="invite-q" className="sr-only">{t("collab.invite.search")}</label>
                  <input
                    id="invite-q"
                    name="q"
                    defaultValue={query}
                    maxLength={80}
                    placeholder={t("collab.invite.searchPlaceholder")}
                    className="h-10 min-w-0 flex-1 rounded-control border border-line bg-surface-muted px-3 text-sm text-fg focus-visible:focus-ring"
                  />
                  <button type="submit" className={BTN_GHOST}>{t("collab.invite.search")}</button>
                </form>
                {query && candidates.length === 0 ? <p className="text-sm text-fg-muted">{t("collab.invite.noResults")}</p> : null}
                <ul className="space-y-3">
                  {candidates.map((c) => (
                    <li key={c.creator_id} className="rounded-control border border-line p-3">
                      <p className="text-sm font-medium text-fg">{c.full_name}</p>
                      <ConfirmActionForm
                        action={inviteCreator}
                        hidden={{ brief_id: brief.id, creator_id: c.creator_id }}
                        trigger={{ labelKey: "collab.invite.send" }}
                        triggerClassName={BTN_PRIMARY}
                        titleKey="collab.invite.sendTitle"
                        bodyKey="collab.invite.sendBody"
                        confirmKey="collab.invite.sendConfirm"
                        successKey="collab.invite.sent"
                        params={{ name: c.full_name }}
                        className="mt-2 space-y-3"
                      >
                        <TextArea id={`inv-msg-${c.creator_id}`} name="message" labelKey="collab.invite.message" required maxLength={LIMITS.message} rows={3} />
                        <TextInput id={`inv-amt-${c.creator_id}`} name="amount" labelKey="collab.invite.amount" inputMode="decimal" dir="ltr" />
                      </ConfirmActionForm>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </GlassPanel>
        </div>
      </div>
    </>
  );
}

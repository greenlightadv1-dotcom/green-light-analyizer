"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { respondToInvitation } from "@/app/(app)/collaborations/actions";
import { invitationActions, LIMITS } from "@/lib/collab/rules";
import { day, usd } from "@/lib/collab/display";
import type { Brief, Invitation } from "@/lib/types/database";
import { BriefSummary } from "./BriefSummary";
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, Status, TextArea } from "./ui";

/** Creator: invitations to respond to, and the briefs companies have published. */
export function OpportunitiesView({
  invitations,
  briefs,
  briefTitles,
  names,
  collaborationByInvitation,
}: {
  invitations: Invitation[];
  briefs: Brief[];
  briefTitles: Record<string, string>;
  names: Record<string, string>;
  collaborationByInvitation: Record<string, string>;
}) {
  const { t } = useTranslation();
  return (
    <>
      <SectionHeader title={t("collab.opp.title")} description={t("collab.opp.description")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="opp-inv" className="space-y-3">
          <h2 id="opp-inv" className="text-sm font-semibold text-fg">{t("collab.opp.invitations")}</h2>
          {invitations.length === 0 ? (
            <GlassPanel className="p-5 text-sm text-fg-muted">{t("collab.opp.noInvitations")}</GlassPanel>
          ) : (
            invitations.map((inv) => {
              const a = invitationActions("creator", inv.status);
              const collabId = collaborationByInvitation[inv.id];
              return (
                <GlassPanel key={inv.id} className="space-y-3 p-5 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p dir="auto" className="font-medium [overflow-wrap:anywhere] text-fg">{briefTitles[inv.brief_id] ?? "—"}</p>
                      <p className="text-xs text-fg-muted">
                        {t("collab.opp.from", { company: names[inv.company_id] ?? "—" })} · {day(inv.updated_at)}
                      </p>
                    </div>
                    <Status status={inv.status} />
                  </div>
                  {inv.proposed_amount_usd !== null ? (
                    <p className="text-fg">{t("collab.opp.proposed", { amount: usd(inv.proposed_amount_usd) })}</p>
                  ) : null}
                  <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere] text-fg-secondary">{inv.message}</p>
                  {inv.response_note ? (
                    <div className="rounded-control border border-line bg-surface-muted p-3">
                      <p className="text-xs text-fg-muted">{t("collab.opp.note")}</p>
                      <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere] text-fg">{inv.response_note}</p>
                    </div>
                  ) : null}
                  {collabId ? <Link href={`/collaborations/${collabId}`} className={BTN_PRIMARY}>{t("collab.opp.openCollaboration")}</Link> : null}
                  <div className="flex flex-wrap gap-2">
                    {a.accept ? (
                      <ConfirmActionForm
                        action={respondToInvitation}
                        hidden={{ invitation_id: inv.id, response: "accept" }}
                        trigger={{ labelKey: "collab.opp.accept" }}
                        triggerClassName={BTN_PRIMARY}
                        titleKey="collab.opp.acceptTitle"
                        bodyKey="collab.opp.acceptBody"
                        confirmKey="collab.opp.acceptConfirm"
                        successKey="collab.opp.accepted"
                        className="flex flex-wrap items-center gap-2"
                      />
                    ) : null}
                    {a.decline ? (
                      <ConfirmActionForm
                        action={respondToInvitation}
                        hidden={{ invitation_id: inv.id, response: "decline" }}
                        trigger={{ labelKey: "collab.opp.decline" }}
                        triggerClassName={BTN_DANGER}
                        titleKey="collab.opp.declineTitle"
                        bodyKey="collab.opp.declineBody"
                        confirmKey="collab.opp.declineConfirm"
                        successKey="collab.opp.declined"
                        tone="danger"
                        className="flex flex-wrap items-center gap-2"
                      />
                    ) : null}
                  </div>
                  {a.requestChanges ? (
                    <details className="rounded-control border border-line p-3">
                      <summary className="cursor-pointer text-sm text-fg">{t("collab.opp.requestChanges")}</summary>
                      <ConfirmActionForm
                        action={respondToInvitation}
                        hidden={{ invitation_id: inv.id, response: "request_changes" }}
                        trigger={{ labelKey: "collab.opp.requestChangesConfirm" }}
                        triggerClassName={BTN_GHOST}
                        titleKey="collab.opp.requestChangesTitle"
                        bodyKey="collab.opp.requestChangesBody"
                        confirmKey="collab.opp.requestChangesConfirm"
                        successKey="collab.opp.changesSent"
                        className="mt-3 space-y-3"
                      >
                        <TextArea id={`note-${inv.id}`} name="note" labelKey="collab.opp.note" required maxLength={LIMITS.note} rows={3} />
                      </ConfirmActionForm>
                    </details>
                  ) : null}
                </GlassPanel>
              );
            })
          )}
        </section>

        <section aria-labelledby="opp-briefs" className="space-y-3">
          <h2 id="opp-briefs" className="text-sm font-semibold text-fg">{t("collab.opp.briefs")}</h2>
          {briefs.length === 0 ? (
            <GlassPanel className="p-5 text-sm text-fg-muted">{t("collab.opp.noBriefs")}</GlassPanel>
          ) : (
            briefs.map((b) => (
              <GlassPanel key={b.id} className="space-y-2 p-5">
                <p dir="auto" className="font-medium [overflow-wrap:anywhere] text-fg">{b.title}</p>
                <p className="text-xs text-fg-muted">{t("collab.opp.from", { company: names[b.company_id] ?? "—" })} · {day(b.published_at)}</p>
                <BriefSummary brief={b} />
              </GlassPanel>
            ))
          )}
        </section>
      </div>
    </>
  );
}

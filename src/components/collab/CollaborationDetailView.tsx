"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { GlassPanel } from "@/components/ui/GlassPanel";
import {
  addDeliverable,
  cancelCollaboration,
  completeCollaboration,
  confirmTerms,
  proposeTerms,
  removeDeliverable,
  reviewDeliverable,
  submitDeliverable,
} from "@/app/(app)/collaborations/actions";
import { collaborationActions, deliverableActions, LIMITS, type Side } from "@/lib/collab/rules";
import { day, usd } from "@/lib/collab/display";
import type { Brief, Collaboration, CollaborationEvent, Deliverable } from "@/lib/types/database";
import { BriefSummary } from "./BriefSummary";
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, Status, TextArea, TextInput } from "./ui";

/**
 * One collaboration: terms, deliverables, completion and history. `side` is
 * null for an admin, who sees everything read-only. Which buttons render
 * comes from lib/collab/rules.ts, which mirrors the database functions; the
 * database still decides.
 */
export function CollaborationDetailView({
  side,
  viewerId,
  collaboration: c,
  deliverables,
  events,
  brief,
  briefTitle,
  names,
}: {
  side: Side | null;
  viewerId: string;
  collaboration: Collaboration;
  deliverables: Deliverable[];
  events: CollaborationEvent[];
  brief: Brief | null;
  briefTitle: string;
  names: Record<string, string>;
}) {
  const { t } = useTranslation();
  const can = side ? collaborationActions(side, c, deliverables) : null;
  const other = side === "company" ? names[c.creator_id] : side === "creator" ? names[c.company_id] : `${names[c.company_id] ?? "—"} · ${names[c.creator_id] ?? "—"}`;
  const hidden = { collaboration_id: c.id };

  return (
    <>
      <Link href="/collaborations" className="mb-3 inline-block text-xs text-fg-muted hover:text-fg focus-visible:focus-ring">← {t("collab.c.title")}</Link>
      <SectionHeader title={briefTitle} description={t("collab.c.with", { name: other ?? "—" })} action={<Status status={c.status} />} />
      {!side ? <p className="mb-4 text-sm text-fg-muted">{t("collab.c.readOnly")}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Terms */}
          <GlassPanel className="space-y-3 p-5">
            <h2 className="text-sm font-semibold text-fg">{t("collab.c.terms")}</h2>
            {c.agreed_at ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-success">{t("collab.c.agreed", { amount: usd(c.agreed_amount_usd), date: day(c.agreed_at) })}</p>
                <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere] text-fg">{c.agreed_terms}</p>
              </div>
            ) : c.proposed_terms ? (
              <div className="space-y-2 text-sm">
                <p className="text-xs text-fg-muted">
                  {t("collab.c.proposedBy", { who: c.proposed_by === viewerId ? t("collab.c.you") : side ? t("collab.c.them") : names[c.proposed_by ?? ""] ?? "—" })}
                </p>
                <p className="text-lg font-semibold text-fg">{usd(c.proposed_amount_usd)}</p>
                <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere] text-fg">{c.proposed_terms}</p>
                <ul className="flex flex-wrap gap-3 text-xs">
                  <li className={c.company_confirmed_at ? "text-success" : "text-fg-muted"}>
                    {c.company_confirmed_at ? `✓ ${t("collab.c.confirmedCompany")}` : `○ ${t("collab.c.waiting")}`}
                  </li>
                  <li className={c.creator_confirmed_at ? "text-success" : "text-fg-muted"}>
                    {c.creator_confirmed_at ? `✓ ${t("collab.c.confirmedCreator")}` : `○ ${t("collab.c.waiting")}`}
                  </li>
                </ul>
              </div>
            ) : (
              <p className="text-sm text-fg-muted">{t("collab.c.noTerms")}</p>
            )}
            {can?.confirmTerms ? (
              <ConfirmActionForm
                action={confirmTerms}
                hidden={hidden}
                trigger={{ labelKey: "collab.c.confirm" }}
                triggerClassName={BTN_PRIMARY}
                titleKey="collab.c.confirmTitle"
                bodyKey="collab.c.confirmBody"
                confirmKey="collab.c.confirmConfirm"
                successKey="collab.c.confirmed"
                className="flex flex-wrap items-center gap-2"
              />
            ) : null}
            {can?.proposeTerms ? (
              <details className="rounded-control border border-line p-3">
                <summary className="cursor-pointer text-sm text-fg">{t("collab.c.propose")}</summary>
                <ConfirmActionForm
                  action={proposeTerms}
                  hidden={hidden}
                  trigger={{ labelKey: "collab.c.propose" }}
                  triggerClassName={BTN_GHOST}
                  titleKey="collab.c.proposeTitle"
                  bodyKey="collab.c.proposeBody"
                  confirmKey="collab.c.proposeConfirm"
                  successKey="collab.c.proposed"
                  className="mt-3 space-y-3"
                >
                  <TextInput id="terms-amount" name="amount" labelKey="collab.c.amount" required inputMode="decimal" dir="ltr" defaultValue={c.proposed_amount_usd ?? ""} />
                  <TextArea id="terms-text" name="terms" labelKey="collab.c.termsField" hintKey="collab.c.termsHint" required minLength={LIMITS.terms[0]} maxLength={LIMITS.terms[1]} rows={5} defaultValue={c.proposed_terms ?? ""} />
                </ConfirmActionForm>
              </details>
            ) : null}
          </GlassPanel>

          {/* Deliverables */}
          <GlassPanel className="overflow-hidden">
            <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-fg">{t("collab.c.deliverables")}</h2>
            {deliverables.length === 0 ? (
              <p className="px-5 py-6 text-sm text-fg-muted">{t("collab.c.noDeliverables")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {deliverables.map((d) => {
                  const a = side ? deliverableActions(side, c.status, d) : null;
                  const dh = { collaboration_id: c.id, deliverable_id: d.id };
                  return (
                    <li key={d.id} className="space-y-2 px-5 py-4 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span dir="auto" className="font-medium [overflow-wrap:anywhere] text-fg">{d.title}</span>
                        <Status status={d.status} />
                      </div>
                      <p className="text-xs text-fg-muted">
                        {d.due_date ? t("collab.c.due", { date: day(d.due_date) }) : ""}
                        {d.revision_count ? `${d.due_date ? " · " : ""}${t("collab.c.revisions", { count: d.revision_count })}` : ""}
                      </p>
                      {d.description ? <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere] text-fg-secondary">{d.description}</p> : null}
                      {d.submission_url || d.submission_note ? (
                        <div className="rounded-control border border-line bg-surface-muted p-3">
                          <p className="text-xs text-fg-muted">{t("collab.c.submittedLink")} · {day(d.submitted_at)}</p>
                          {d.submission_url ? (
                            <a href={d.submission_url} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" className="break-all text-info underline">
                              {d.submission_url}
                            </a>
                          ) : null}
                          {d.submission_note ? <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere] text-fg">{d.submission_note}</p> : null}
                        </div>
                      ) : null}
                      {d.review_note ? (
                        <div className="rounded-control border border-warning/30 bg-warning/5 p-3">
                          <p className="text-xs text-fg-muted">{t("collab.c.companyNote")}</p>
                          <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere] text-fg">{d.review_note}</p>
                        </div>
                      ) : null}
                      {a?.submit ? (
                        <ConfirmActionForm
                          action={submitDeliverable}
                          hidden={dh}
                          trigger={{ labelKey: "collab.c.submit" }}
                          triggerClassName={BTN_PRIMARY}
                          titleKey="collab.c.submitTitle"
                          bodyKey="collab.c.submitBody"
                          confirmKey="collab.c.submitConfirm"
                          successKey="collab.c.submittedDone"
                          className="space-y-3 rounded-control border border-line p-3"
                        >
                          <TextInput id={`url-${d.id}`} name="url" type="url" labelKey="collab.c.url" dir="ltr" maxLength={500} pattern="https://.*" defaultValue={d.submission_url ?? ""} />
                          <TextArea id={`snote-${d.id}`} name="note" labelKey="collab.c.note" maxLength={LIMITS.note} rows={2} />
                        </ConfirmActionForm>
                      ) : null}
                      {a?.review ? (
                        <div className="flex flex-wrap gap-2">
                          <ConfirmActionForm
                            action={reviewDeliverable}
                            hidden={{ ...dh, decision: "approve" }}
                            trigger={{ labelKey: "collab.c.approve" }}
                            triggerClassName={BTN_PRIMARY}
                            titleKey="collab.c.approveTitle"
                            bodyKey="collab.c.approveBody"
                            confirmKey="collab.c.approveConfirm"
                            successKey="collab.c.approvedDone"
                            className="flex flex-wrap items-center gap-2"
                          />
                          <details className="w-full rounded-control border border-line p-3">
                            <summary className="cursor-pointer text-sm text-fg">{t("collab.c.requestRevision")}</summary>
                            <ConfirmActionForm
                              action={reviewDeliverable}
                              hidden={{ ...dh, decision: "revise" }}
                              trigger={{ labelKey: "collab.c.requestRevision" }}
                              triggerClassName={BTN_GHOST}
                              titleKey="collab.c.revisionTitle"
                              bodyKey="collab.c.revisionBody"
                              confirmKey="collab.c.revisionConfirm"
                              successKey="collab.c.revisionSent"
                              className="mt-3 space-y-3"
                            >
                              <TextArea id={`rnote-${d.id}`} name="note" labelKey="collab.c.reviewNote" required maxLength={LIMITS.note} rows={3} />
                            </ConfirmActionForm>
                          </details>
                        </div>
                      ) : null}
                      {a?.remove ? (
                        <ConfirmActionForm
                          action={removeDeliverable}
                          hidden={dh}
                          trigger={{ labelKey: "collab.c.remove" }}
                          triggerClassName={BTN_DANGER}
                          titleKey="collab.c.removeTitle"
                          bodyKey="collab.c.removeBody"
                          confirmKey="collab.c.removeConfirm"
                          tone="danger"
                          className="flex flex-wrap items-center gap-2"
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {can?.addDeliverable ? (
              <details className="border-t border-line px-5 py-4">
                <summary className="cursor-pointer text-sm text-fg">{t("collab.c.addDeliverable")}</summary>
                <ConfirmActionForm
                  action={addDeliverable}
                  hidden={hidden}
                  trigger={{ labelKey: "collab.c.add" }}
                  triggerClassName={BTN_GHOST}
                  titleKey="collab.c.addTitle"
                  bodyKey="collab.c.addBody"
                  confirmKey="collab.c.addConfirm"
                  successKey="collab.c.added"
                  className="mt-3 space-y-3"
                >
                  <TextInput id="d-title" name="title" labelKey="collab.c.deliverableTitle" required minLength={LIMITS.deliverableTitle[0]} maxLength={LIMITS.deliverableTitle[1]} />
                  <TextArea id="d-desc" name="description" labelKey="collab.c.deliverableDescription" maxLength={LIMITS.note} rows={2} />
                  <TextInput id="d-due" name="due_date" type="date" labelKey="collab.c.dueField" />
                </ConfirmActionForm>
              </details>
            ) : null}
          </GlassPanel>

          {/* History */}
          <GlassPanel className="overflow-hidden">
            <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-fg">{t("collab.c.history")}</h2>
            <ol className="divide-y divide-line">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-2.5 text-sm">
                  <span className="text-fg">
                    {t(`collab.events.${e.event_type}`)}
                    {e.actor_id ? <span className="text-fg-muted"> · {e.actor_id === viewerId ? t("collab.c.you") : names[e.actor_id] ?? "—"}</span> : null}
                  </span>
                  <span className="text-xs text-fg-muted">{day(e.created_at)}</span>
                </li>
              ))}
            </ol>
          </GlassPanel>
        </div>

        <div className="space-y-4">
          <GlassPanel className="space-y-3 p-5">
            {c.deal_chat_id && side ? (
              <>
                <Link href={`/inbox/${c.deal_chat_id}`} className={BTN_PRIMARY}>{t("collab.c.openDealRoom")}</Link>
                <p className="text-xs text-fg-muted">{t("collab.c.dealRoomNote")}</p>
              </>
            ) : null}
            {can?.complete ? (
              <ConfirmActionForm
                action={completeCollaboration}
                hidden={hidden}
                trigger={{ labelKey: "collab.c.complete" }}
                triggerClassName={BTN_PRIMARY}
                titleKey="collab.c.completeTitle"
                bodyKey="collab.c.completeBody"
                confirmKey="collab.c.completeConfirm"
                successKey="collab.c.completedDone"
                className="flex flex-wrap items-center gap-2"
              />
            ) : null}
            {c.cancel_reason ? (
              <div className="rounded-control border border-danger/30 bg-danger/5 p-3 text-sm">
                <p className="text-xs text-fg-muted">{t("collab.c.reason")}</p>
                <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere] text-fg">{c.cancel_reason}</p>
              </div>
            ) : null}
            {can?.cancel ? (
              <details className="rounded-control border border-line p-3">
                <summary className="cursor-pointer text-sm text-danger">{t("collab.c.cancel")}</summary>
                <ConfirmActionForm
                  action={cancelCollaboration}
                  hidden={hidden}
                  trigger={{ labelKey: "collab.c.cancel" }}
                  triggerClassName={BTN_DANGER}
                  titleKey="collab.c.cancelTitle"
                  bodyKey="collab.c.cancelBody"
                  confirmKey="collab.c.cancelConfirm"
                  successKey="collab.c.cancelledDone"
                  tone="danger"
                  className="mt-3 space-y-3"
                >
                  <TextArea id="cancel-reason" name="reason" labelKey="collab.c.reason" required minLength={LIMITS.reason[0]} maxLength={LIMITS.reason[1]} rows={2} />
                </ConfirmActionForm>
              </details>
            ) : null}
            <p className="text-xs leading-relaxed text-fg-muted">{t("collab.c.commissionNote")}</p>
          </GlassPanel>

          {brief ? (
            <GlassPanel className="space-y-2 p-5">
              <h2 className="text-sm font-semibold text-fg">{t("collab.c.brief")}</h2>
              <BriefSummary brief={brief} />
            </GlassPanel>
          ) : null}
        </div>
      </div>
    </>
  );
}

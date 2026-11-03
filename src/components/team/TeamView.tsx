"use client";

import { useActionState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmActionForm } from "@/components/ui/ConfirmActionForm";
import { SCOPES, type ScopeId } from "@/lib/company-access";
import { saveRepresentedCompany, setRepresentativeScope } from "@/app/(app)/team/actions";
import type { ActionResult } from "@/lib/ui/action-result";
import { day } from "@/lib/collab/display";

type Member = { id: string; name: string; since: string; scopes: ScopeId[] };
type Event = { id: number; member_id: string; name: string; scope: string; action: string; created_at: string };
type Props =
  | { mode: "owner"; available: boolean; members: Member[]; events: Event[] }
  | {
      mode: "representative";
      companyName: string;
      scopes: ScopeId[];
      company: { full_name: string; bio: string | null; company_industry?: string | null; company_website?: string | null } | null;
      briefs: { id: string; title: string; status: string; updated_at: string }[];
    };

const INPUT = "mt-1 w-full rounded-control border border-line bg-surface-muted px-3 py-2 text-sm text-fg";

function ScopeRow({ member, scope }: { member: Member; scope: (typeof SCOPES)[number] }) {
  const { t } = useTranslation();
  const on = member.scopes.includes(scope.id);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span className="min-w-0">
        <span className="text-fg">{t(`team.scope.${scope.id.replace(".", "_")}.title`)}</span>
        <span className="block text-xs text-fg-muted">{t(`team.scope.${scope.id.replace(".", "_")}.body`)}</span>
      </span>
      {scope.status === "available" ? (
        <ConfirmActionForm
          action={setRepresentativeScope}
          hidden={{ member_id: member.id, scope: scope.id, grant: on ? "0" : "1" }}
          trigger={{ labelKey: on ? "team.revoke" : "team.grant" }}
          triggerClassName={`h-8 rounded-chip px-3 text-xs font-medium ${on ? "border border-danger/40 text-danger" : "bg-brand-green text-ink"}`}
          titleKey={on ? "team.revokeTitle" : "team.grantTitle"}
          bodyKey={on ? "team.revokeBody" : "team.grantBody"}
          confirmKey={on ? "team.revoke" : "team.grant"}
          successKey="team.saved"
          tone={on ? "danger" : "default"}
        />
      ) : (
        <StatusBadge tone="neutral">{t(`team.status.${scope.status}`)}</StatusBadge>
      )}
    </li>
  );
}

function CompanyEdit({ company }: { company: NonNullable<Extract<Props, { mode: "representative" }>["company"]> }) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveRepresentedCompany, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-xs text-fg-secondary">{t("team.companyName")}<input name="full_name" defaultValue={company.full_name} required maxLength={120} className={INPUT} /></label>
      <label className="block text-xs text-fg-secondary">{t("team.companyIndustry")}<input name="company_industry" defaultValue={company.company_industry ?? ""} required maxLength={60} className={INPUT} /></label>
      <label className="block text-xs text-fg-secondary">{t("team.companyWebsite")}<input name="company_website" defaultValue={company.company_website ?? ""} maxLength={200} dir="ltr" className={INPUT} /></label>
      <label className="block text-xs text-fg-secondary">{t("team.companyBio")}<textarea name="bio" defaultValue={company.bio ?? ""} required maxLength={600} rows={4} className={INPUT} /></label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="h-10 rounded-control bg-brand-green px-4 text-sm font-semibold text-ink disabled:opacity-50">{pending ? t("team.saving") : t("team.save")}</button>
        {state ? <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.ok ? t("team.saved") : t(state.errorKey)}</p> : null}
      </div>
    </form>
  );
}

/** Company team: scopes for representatives (owner view) or what a representative may do (representative view). */
export function TeamView(props: Props) {
  const { t } = useTranslation();
  if (props.mode === "representative") {
    const can = (s: ScopeId) => props.scopes.includes(s);
    return (
      <>
        <SectionHeader title={t("team.repTitle", { company: props.companyName })} description={t("team.repIntro")} />
        <GlassPanel className="mb-4 p-5">
          <h2 className="mb-2 text-sm font-semibold text-fg">{t("team.yourScopes")}</h2>
          {props.scopes.length ? (
            <ul className="flex flex-wrap gap-2">{props.scopes.map((s) => <li key={s}><StatusBadge tone="success">{t(`team.scope.${s.replace(".", "_")}.title`)}</StatusBadge></li>)}</ul>
          ) : (
            <p className="text-sm text-fg-muted">{t("team.noScopes")}</p>
          )}
        </GlassPanel>
        {props.company && can("company.edit") ? (
          <GlassPanel className="mb-4 p-5"><h2 className="mb-3 text-sm font-semibold text-fg">{t("team.companyProfile")}</h2><CompanyEdit company={props.company} /></GlassPanel>
        ) : props.company ? (
          <GlassPanel className="mb-4 space-y-1 p-5 text-sm">
            <h2 className="mb-2 text-sm font-semibold text-fg">{t("team.companyProfile")}</h2>
            <p className="text-fg">{props.company.full_name}</p>
            {props.company.company_industry ? <p className="text-fg-secondary">{props.company.company_industry}</p> : null}
            {props.company.company_website ? <p className="text-fg-secondary" dir="ltr">{props.company.company_website}</p> : null}
            {props.company.bio ? <p className="whitespace-pre-wrap text-fg-secondary" dir="auto">{props.company.bio}</p> : null}
          </GlassPanel>
        ) : null}
        {can("briefs.view") ? (
          <GlassPanel className="overflow-hidden">
            <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-fg">{t("team.companyBriefs")}</h2>
            {props.briefs.length ? (
              <ul className="divide-y divide-line">{props.briefs.map((b) => <li key={b.id} className="flex justify-between gap-2 px-5 py-2 text-sm"><span dir="auto" className="text-fg">{b.title}</span><span className="text-xs text-fg-muted">{b.status} · {day(b.updated_at)}</span></li>)}</ul>
            ) : (
              <p className="px-5 py-4 text-sm text-fg-muted">{t("team.noBriefs")}</p>
            )}
          </GlassPanel>
        ) : null}
      </>
    );
  }
  return (
    <>
      <SectionHeader title={t("team.title")} description={t("team.intro")} />
      {!props.available ? <GlassPanel className="mb-4 p-5 text-sm text-fg-muted">{t("team.unavailable")}</GlassPanel> : null}
      {props.members.length === 0 ? (
        <GlassPanel className="p-5 text-sm text-fg-muted">{t("team.noMembers")}</GlassPanel>
      ) : (
        <div className="space-y-4">
          {props.members.map((m) => (
            <GlassPanel key={m.id} className="p-5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-fg">{m.name}</h2>
                <span className="text-xs text-fg-muted">{t("team.since", { date: day(m.since) })}</span>
              </div>
              <ul className="divide-y divide-line">{SCOPES.map((s) => <ScopeRow key={s.id} member={m} scope={s} />)}</ul>
            </GlassPanel>
          ))}
        </div>
      )}
      {props.events.length ? (
        <GlassPanel className="mt-4 overflow-hidden">
          <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-fg">{t("team.history")}</h2>
          <ol className="divide-y divide-line text-sm">
            {props.events.map((e) => (
              <li key={e.id} className="flex justify-between gap-2 px-5 py-2">
                <span className="text-fg">{e.name} · {t(`team.action.${e.action}`)} · {t(`team.scope.${e.scope.replace(".", "_")}.title`)}</span>
                <span className="text-xs text-fg-muted">{day(e.created_at)}</span>
              </li>
            ))}
          </ol>
        </GlassPanel>
      ) : null}
    </>
  );
}

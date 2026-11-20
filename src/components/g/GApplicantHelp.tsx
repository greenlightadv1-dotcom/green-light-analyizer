"use client";

import { useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { day } from "@/lib/collab/display";
import type { ApplicantSummary } from "@/lib/g/applicant";

/**
 * G for applicants and accounts awaiting verification (Phase 1E).
 *
 * Deliberately small: text only, no voice and no wake word, no prepared
 * actions. It explains the caller's own application; it cannot change it.
 * The conversation lives only in this component's memory, never in storage,
 * because the person may be on a shared device before they have an account.
 */

type Msg = { role: "user" | "assistant"; text: string; engine?: "ai" | "rules"; card?: ApplicantSummary; error?: string };

const SUGGEST = ["g.applicant.suggest1", "g.applicant.suggest2", "g.applicant.suggest3"];

export function GApplicantHelp() {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);

  async function ask(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const history = messages.slice(-6).filter((m) => m.text).map((m) => ({ role: m.role, text: m.text }));
    setMessages((ms) => [...ms, { role: "user", text: message }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/g/applicant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, history, locale }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = res.status === 429 ? "rate_limited" : res.status === 401 ? "no_application" : "failed";
        setMessages((ms) => [...ms, { role: "assistant", text: "", error: code }]);
      } else {
        setMessages((ms) => [...ms, { role: "assistant", text: body.reply ?? "", engine: body.engine, card: body.cards?.application }]);
      }
    } catch {
      setMessages((ms) => [...ms, { role: "assistant", text: "", error: "failed" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="g-applicant-title" className="mx-auto mt-6 w-full max-w-2xl rounded-card border border-line bg-surface p-4 text-sm" data-testid="g-applicant">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="g-applicant-title" className="font-semibold text-fg">{t("g.applicant.title")}</h2>
          <p className="text-xs text-fg-muted">{t("g.applicant.subtitle")}</p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-hover focus-visible:focus-ring">
          {open ? t("g.applicant.close") : t("g.applicant.open")}
        </button>
      </div>
      {open ? (
        <div className="mt-3 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-wrap gap-2">
              {SUGGEST.map((k) => (
                <button key={k} type="button" onClick={() => ask(t(k))} className="rounded-full border border-line bg-surface-soft px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface-hover focus-visible:focus-ring">
                  {t(k)}
                </button>
              ))}
            </div>
          ) : null}
          <ol className="space-y-2" aria-live="polite">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <li key={i} dir="auto" className="ms-8 rounded-2xl bg-surface-soft px-3 py-2 text-fg">{m.text}</li>
              ) : (
                <li key={i} className="me-4 space-y-2">
                  {m.error ? <p className="text-danger" role="alert">{t(`g.applicant.error.${m.error}`)}</p> : null}
                  {m.text ? <p dir="auto" className="whitespace-pre-wrap text-fg-secondary">{m.text}</p> : null}
                  {m.engine === "rules" && !m.error ? <p className="text-[11px] text-fg-muted">{t("g.rulesNotice")}</p> : null}
                  {m.card ? <ApplicantCard data={m.card} /> : null}
                </li>
              ),
            )}
            {busy ? <li className="text-xs text-fg-muted" role="status">{t("g.applicant.thinking")}</li> : null}
          </ol>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
            className="flex gap-2"
          >
            <label htmlFor="g-applicant-input" className="sr-only">{t("g.applicant.inputLabel")}</label>
            <input id="g-applicant-input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} dir="auto" placeholder={t("g.applicant.placeholder")} className="min-w-0 flex-1 rounded-full border border-line bg-surface px-3 py-2 text-sm text-fg focus-visible:focus-ring" />
            <button type="submit" disabled={busy || !input.trim()} className="rounded-full bg-brand-green px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60 focus-visible:focus-ring">
              {t("g.applicant.send")}
            </button>
          </form>
          <p className="text-[11px] leading-relaxed text-fg-muted">{t("g.applicant.limits")}</p>
        </div>
      ) : null}
    </section>
  );
}

function ApplicantCard({ data }: { data: ApplicantSummary }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface-soft p-3 text-xs" data-testid="g-applicant-card">
      {data.email_verified === false ? <p className="font-medium text-warning">{t("g.applicant.next.verify_email")}</p> : null}
      {data.cases.length === 0 ? <p className="text-fg-muted">{t("g.applicant.noCase")}</p> : null}
      {data.cases.map((c, i) => (
        <div key={i} className="space-y-1">
          <p className="font-semibold text-fg">
            {t(`verification.kind.${c.kind}`)} · {t(`verification.status.${c.status}`)}
            {c.submitted_at ? <span className="font-normal text-fg-muted"> · {t("g.applicant.submitted", { date: day(c.submitted_at) })}</span> : null}
          </p>
          <p className="text-fg">{t(`g.applicant.next.${c.next}`)}</p>
          {c.missing_fields.length ? (
            <p className="text-fg-secondary">{t("g.applicant.missingFields")}: {c.missing_fields.map((f) => t(`verification.field.${f}`)).join(", ")}</p>
          ) : null}
          {c.missing_documents.length ? (
            <p className="text-fg-secondary">
              {t("g.applicant.missingDocuments")}: {c.missing_documents.map((set) => set.map((d) => t(`verification.docType.${d}`)).join(t("verification.or"))).join(", ")}
            </p>
          ) : null}
          {c.info_request ? (
            <p dir="auto" className="whitespace-pre-wrap text-fg-secondary">{t("g.applicant.infoRequest")}: “{c.info_request}”</p>
          ) : null}
          {c.decision_reason ? (
            <p dir="auto" className="whitespace-pre-wrap text-fg-secondary">{t("g.applicant.decisionReason")}: “{c.decision_reason}”</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

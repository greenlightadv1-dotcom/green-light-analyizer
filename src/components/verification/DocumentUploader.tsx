"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/components/LocaleProvider";
import { UPLOAD } from "@/lib/verification/rules";
import type { VerificationDocType } from "@/lib/types/database";

/**
 * Drag-and-drop (or file picker) upload of one ordinary verification
 * document (company registration, tax card, authorization letter), with
 * progress. Never used for a creator's identity images, which are camera-only
 * (CameraCapture). The server decides the file type from its bytes; the checks here
 * only save a round trip. Nothing is shown back: documents are never
 * readable by the applicant's browser after upload.
 */
export function DocumentUploader({ caseId, types, endpoint = "/api/verification/documents", demo = false }: { caseId: string; types: VerificationDocType[]; endpoint?: string; demo?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<VerificationDocType>(types[0]);
  const [over, setOver] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const send = (file: File) => {
    setMessage(null);
    if (file.size === 0) return setMessage({ ok: false, text: t("verification.uploadErrors.empty") });
    if (file.size > UPLOAD.maxBytes) return setMessage({ ok: false, text: t("verification.uploadErrors.too_large") });
    if (file.type && !(UPLOAD.mimes as readonly string[]).includes(file.type)) return setMessage({ ok: false, text: t("verification.uploadErrors.type") });
    if (demo) return setMessage({ ok: false, text: t("g.proposal.demo") });
    const body = new FormData();
    body.set("case_id", caseId);
    body.set("doc_type", docType);
    body.set("capture", "upload");
    body.set("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.upload.onprogress = (e) => e.lengthComputable && setPct(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setPct(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        setMessage({ ok: true, text: t("verification.uploaded") });
        router.refresh();
      } else {
        let code = "generic";
        try {
          code = (JSON.parse(xhr.responseText) as { error?: string }).error ?? "generic";
        } catch {}
        const key = `verification.uploadErrors.${code}`;
        const text = t(key);
        setMessage({ ok: false, text: text === key ? t("verification.uploadErrors.generic") : text });
      }
    };
    xhr.onerror = () => {
      setPct(null);
      setMessage({ ok: false, text: t("verification.uploadErrors.generic") });
    };
    xhr.send(body);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) send(file);
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-fg-secondary">
        {t("verification.docTypeLabel")}
        <select value={docType} onChange={(e) => setDocType(e.target.value as VerificationDocType)} className="mt-1 h-10 w-full rounded-control border border-line bg-surface-muted px-3 text-sm text-fg">
          {types.map((d) => (
            <option key={d} value={d} className="bg-slate-900 text-white">{t(`verification.docType.${d}`)}</option>
          ))}
        </select>
      </label>
      <div
        role="button"
        tabIndex={0}
        aria-label={t("verification.dropHere")}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed p-4 text-center text-sm transition focus-visible:focus-ring ${over ? "border-brand-green bg-brand-green/10" : "border-line bg-surface-muted"}`}
      >
        <span className="text-fg">{t("verification.dropHere")}</span>
        <span className="mt-1 text-xs text-fg-muted">{t("verification.choose")}</span>
        <input ref={input} type="file" accept={UPLOAD.mimes.join(",")} className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) send(f); e.target.value = ""; }} />
      </div>
      {pct !== null ? (
        <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full bg-brand-green transition-all" style={{ width: `${pct}%` }} />
          <span className="sr-only">{t("verification.uploading", { pct })}</span>
        </div>
      ) : null}
      {message ? <p role={message.ok ? "status" : "alert"} className={`text-xs ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</p> : null}
    </div>
  );
}

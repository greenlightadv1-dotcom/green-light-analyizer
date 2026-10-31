"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { useTranslation } from "@/components/LocaleProvider";

export type UploadResult = { ok: true; body: unknown } | { ok: false; error: string };

/**
 * Upload with real progress (XHR, since fetch exposes no upload progress).
 * The server is the only judge of type and size; the checks here only spare
 * the user a wasted upload.
 */
export function uploadWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve({ ok: true, body });
      else {
        const err = (body as { error?: unknown } | null)?.error;
        resolve({ ok: false, error: typeof err === "string" ? err : xhr.status === 429 ? "rate_limited" : "failed" });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "network" });
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

/** A keyboard-accessible drop zone. */
export function FileDrop({
  accept,
  maxBytes,
  disabled,
  onFile,
  children,
  label,
}: {
  accept: string;
  maxBytes: number;
  disabled?: boolean;
  onFile: (file: File) => void;
  children?: ReactNode;
  label: string;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const take = (file: File | undefined) => {
    if (!file) return;
    setLocalError(null);
    if (file.size > maxBytes) {
      setLocalError(t("uploads.error.too_large", { mb: String(Math.round(maxBytes / 1024 / 1024)) }));
      return;
    }
    onFile(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) take(e.dataTransfer.files?.[0]);
  };

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        aria-label={label}
        className={`flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-5 text-center text-sm transition
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green disabled:cursor-not-allowed disabled:opacity-50
          ${over ? "border-brand-green bg-brand-green/10 text-fg" : "border-fg/20 bg-fg/5 text-fg/65 hover:border-fg/35"}`}
      >
        {children ?? (
          <>
            <span className="font-medium text-fg">{t("uploads.dropTitle")}</span>
            <span className="text-xs text-fg/50">{t("uploads.dropHint", { mb: String(Math.round(maxBytes / 1024 / 1024)) })}</span>
          </>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {localError ? (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-300">
          {localError}
        </p>
      ) : null}
    </div>
  );
}

export function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-fg/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-brand-green transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { knownError } from "./AvatarUpload";
import { FileDrop, ProgressBar, uploadWithProgress } from "./FileDrop";

const MAX = 5 * 1024 * 1024; // matches UPLOAD_RULES.document and the 0024 bucket
type StoredFile = { path: string; name: string; size: number | null; url: string | null };

/**
 * Private documents (media kit PDF, brand assets). Listed with short-lived
 * signed links; each can be removed. Nothing here is public.
 */
export function DocumentsUpload({ demo = false }: { demo?: boolean }) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<StoredFile[] | null>(demo ? [] : null);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/uploads/documents").catch(() => null);
    if (!res?.ok) {
      setFiles([]);
      setError(t("uploads.error.storage_unavailable"));
      return;
    }
    const body = (await res.json()) as { files?: StoredFile[] };
    setFiles(body.files ?? []);
  }, [t]);

  useEffect(() => {
    if (demo) return;
    let live = true;
    fetch("/api/uploads/documents")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b: { files?: StoredFile[] }) => live && setFiles(b.files ?? []))
      .catch(() => {
        if (!live) return;
        setFiles([]);
        setError(t("uploads.error.storage_unavailable"));
      });
    return () => {
      live = false;
    };
  }, [demo, t]);

  const send = async (file: File) => {
    setLastFile(file);
    setError(null);
    if (demo) return setError(t("uploads.demo"));
    setPct(0);
    const result = await uploadWithProgress("/api/uploads/documents", file, setPct);
    setPct(null);
    if (result.ok) {
      setLastFile(null);
      await load();
    } else setError(t(`uploads.error.${knownError(result.error)}`, { mb: "5" }));
  };

  const remove = async (path: string) => {
    setError(null);
    const res = await fetch(`/api/uploads/documents?path=${encodeURIComponent(path)}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setFiles((f) => (f ?? []).filter((x) => x.path !== path));
    else setError(t("uploads.error.failed"));
  };

  return (
    <div className="space-y-3">
      <FileDrop accept="application/pdf,image/jpeg,image/png,image/webp" maxBytes={MAX} disabled={pct !== null} onFile={send} label={t("uploads.documentLabel")} />
      {pct !== null ? <ProgressBar pct={pct} /> : null}
      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-300">
          {error}{" "}
          {lastFile && !demo ? (
            <button type="button" className="underline" onClick={() => send(lastFile)}>
              {t("uploads.retry")}
            </button>
          ) : null}
        </p>
      ) : null}
      {files === null ? (
        <p className="text-xs text-fg/45">{t("uploads.loading")}</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-fg/45">{t("uploads.noDocuments")}</p>
      ) : (
        <ul className="divide-y divide-fg/10 rounded-xl border border-fg/10">
          {files.map((f) => (
            <li key={f.path} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              {f.url ? (
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="truncate text-fg underline-offset-2 hover:underline" dir="ltr">
                  {f.name}
                </a>
              ) : (
                <span className="truncate text-fg" dir="ltr">{f.name}</span>
              )}
              <button type="button" onClick={() => remove(f.path)} className="shrink-0 text-xs text-fg/55 underline hover:text-fg">
                {t("uploads.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-fg/45">{t("uploads.documentsPrivate")}</p>
    </div>
  );
}

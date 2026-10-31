"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/components/LocaleProvider";
import { FileDrop, ProgressBar, uploadWithProgress } from "./FileDrop";

const MAX = 2 * 1024 * 1024; // matches UPLOAD_RULES.avatar and the 0024 bucket

/** Profile picture / company logo: drag-drop, progress, preview, replace, remove, retry. */
export function AvatarUpload({ initialUrl, demo = false }: { initialUrl: string | null; demo?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const send = async (file: File) => {
    setLastFile(file);
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    if (demo) {
      setError(t("uploads.demo"));
      return;
    }
    setPct(0);
    const result = await uploadWithProgress("/api/uploads/avatar", file, setPct);
    setPct(null);
    if (result.ok) {
      const next = (result.body as { url?: string } | null)?.url ?? null;
      setUrl(next);
      setLastFile(null);
      router.refresh();
    } else {
      setError(t(`uploads.error.${knownError(result.error)}`, { mb: "2" }));
    }
  };

  const remove = async () => {
    setError(null);
    if (demo) return setError(t("uploads.demo"));
    const res = await fetch("/api/uploads/avatar", { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      setUrl(null);
      setPreview(null);
      router.refresh();
    } else setError(t("uploads.error.failed"));
  };

  const shown = pct !== null || error ? (preview ?? url) : url;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-fg/10 bg-fg/5">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- user upload from storage; next/image would need remote config per project
          <img src={shown} alt={t("uploads.previewAlt")} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xs text-fg/40">{t("uploads.none")}</span>
        )}
      </div>
      <div className="flex-1 space-y-2">
        <FileDrop accept="image/jpeg,image/png,image/webp" maxBytes={MAX} disabled={pct !== null} onFile={send} label={t("uploads.avatarLabel")} />
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
        {url ? (
          <button type="button" onClick={remove} className="text-xs text-fg/55 underline hover:text-fg">
            {t("uploads.remove")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

const KNOWN = ["too_large", "type", "empty", "rate_limited", "network", "storage_unavailable", "too_many"];
export function knownError(code: string): string {
  return KNOWN.includes(code) ? code : "failed";
}

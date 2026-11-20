"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import type { CameraDocType } from "@/lib/verification/camera";

/**
 * Live Camera Capture for one identity image (selfie, ID front, ID back).
 *
 * - Uses the device camera inside the page (getUserMedia). There is no file
 *   input, no gallery picker, no drag-and-drop and no URL field anywhere in
 *   this component, and no fallback to one when the camera is unavailable.
 * - The frame is drawn to a canvas and encoded as JPEG (≤ 1600 px on the
 *   long side). A canvas writes no EXIF, which the server checks for.
 * - Preview, retake and confirm. Nothing is sent until the person confirms.
 * - The preview is a local object URL of the captured frame only; the
 *   server never sends an identity image back to the browser.
 *
 * This is a capture flow, not liveness detection or face matching.
 */

type Phase = "idle" | "starting" | "live" | "preview" | "uploading" | "done" | "error";
export type CameraError = "unsupported" | "insecure" | "denied" | "no_camera" | "busy" | "generic" | "upload";
const MAX_SIDE = 1600;

const BTN = "inline-flex h-10 items-center justify-center rounded-control bg-brand-green px-4 text-sm font-semibold text-ink hover:brightness-110 focus-visible:focus-ring disabled:opacity-50";
const GHOST = "inline-flex h-10 items-center justify-center rounded-control border border-line bg-surface-muted px-4 text-sm text-fg hover:bg-surface-hover focus-visible:focus-ring disabled:opacity-50";

function errorCode(e: unknown): CameraError {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "no_camera";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  return "generic";
}

export function CameraCapture({
  caseId,
  docType,
  endpoint,
  captured,
  step,
  total,
  demo = false,
  onUploaded,
}: {
  caseId: string;
  docType: CameraDocType;
  endpoint: string;
  captured: boolean;
  step: number;
  total: number;
  demo?: boolean;
  onUploaded?: () => void;
}) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>(captured ? "done" : "idle");
  const [error, setError] = useState<CameraError | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
  }, []);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const start = async () => {
    setError(null);
    setUploadError(null);
    if (typeof window !== "undefined" && !window.isSecureContext) return (setError("insecure"), setPhase("error"));
    if (!navigator.mediaDevices?.getUserMedia) return (setError("unsupported"), setPhase("error"));
    setPhase("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: docType === "selfie" ? "user" : { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      stream.current = s;
      setPhase("live");
      // The <video> mounts with phase "live"; attach on the next frame.
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => undefined);
        }
      });
    } catch (e) {
      stop();
      setError(errorCode(e));
      setPhase("error");
    }
  };

  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return (setError("generic"), setPhase("error"));
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (b) => {
        if (!b) return (setError("generic"), setPhase("error"));
        stop();
        setBlob(b);
        setPreviewUrl(URL.createObjectURL(b));
        setPhase("preview");
      },
      "image/jpeg",
      0.9,
    );
  };

  const retake = () => {
    setBlob(null);
    setPreviewUrl(null);
    void start();
  };

  const confirm = async () => {
    if (!blob) return;
    setUploadError(null);
    if (demo) {
      setPhase("done");
      setBlob(null);
      setPreviewUrl(null);
      return;
    }
    setPhase("uploading");
    const body = new FormData();
    body.set("case_id", caseId);
    body.set("doc_type", docType);
    body.set("capture", "camera");
    body.set("file", blob, "capture.jpg");
    try {
      const res = await fetch(endpoint, { method: "POST", body });
      if (!res.ok) {
        const code = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "generic";
        const key = `verification.uploadErrors.${code}`;
        const text = t(key);
        setUploadError(text === key ? t("verification.uploadErrors.generic") : text);
        setPhase("preview");
        return;
      }
      setBlob(null);
      setPreviewUrl(null);
      setPhase("done");
      onUploaded?.();
    } catch {
      setUploadError(t("verification.uploadErrors.generic"));
      setPhase("preview");
    }
  };

  return (
    <section aria-labelledby={`cam-${docType}`} data-camera-slot={docType} className="space-y-3 rounded-card border border-line bg-surface-muted p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 id={`cam-${docType}`} className="text-sm font-semibold text-fg">
          <span className="text-fg-muted">{t("camera.step", { step, total })} · </span>
          {t(`camera.doc.${docType}.title`)}
        </h4>
        {phase === "done" ? <span className="text-xs font-medium text-success">{t("camera.captured")}</span> : null}
      </div>
      <p className="text-xs leading-relaxed text-fg-secondary">{t(`camera.doc.${docType}.why`)}</p>
      <p className="text-xs leading-relaxed text-fg-muted">{t(`camera.doc.${docType}.how`)}</p>

      {phase === "live" || phase === "starting" ? (
        <div className="relative overflow-hidden rounded-control bg-black">
          <video
            ref={video}
            playsInline
            muted
            autoPlay
            aria-label={t("camera.liveView")}
            className={`aspect-video w-full object-cover ${docType === "selfie" ? "-scale-x-100" : ""}`}
          />
          {phase === "starting" ? <p className="absolute inset-0 flex items-center justify-center text-sm text-white">{t("camera.starting")}</p> : null}
          {docType !== "selfie" ? <div aria-hidden className="pointer-events-none absolute inset-6 rounded-lg border-2 border-dashed border-white/70" /> : null}
        </div>
      ) : null}

      {phase === "preview" || phase === "uploading" ? (
        previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL of the just-captured frame
          <img src={previewUrl} alt={t("camera.previewAlt")} className="w-full rounded-control" />
        ) : null
      ) : null}

      {phase === "error" && error ? (
        <div role="alert" className="space-y-1 rounded-control border border-danger/40 bg-danger/10 p-3 text-sm text-fg">
          <p className="font-medium">{t(`camera.error.${error}.title`)}</p>
          <p className="text-xs leading-relaxed text-fg-secondary">{t(`camera.error.${error}.body`)}</p>
          <p className="text-xs text-fg-muted">{t("camera.noUploadFallback")}</p>
        </div>
      ) : null}
      {uploadError ? <p role="alert" className="text-xs text-danger">{uploadError}</p> : null}

      <div className="flex flex-wrap gap-2">
        {phase === "idle" || phase === "error" ? (
          <button type="button" onClick={start} className={BTN}>{phase === "error" ? t("camera.tryAgain") : t("camera.open")}</button>
        ) : null}
        {phase === "done" ? <button type="button" onClick={start} className={GHOST}>{t("camera.retake")}</button> : null}
        {phase === "live" ? (
          <>
            <button type="button" onClick={capture} className={BTN}>{t("camera.capture")}</button>
            <button type="button" onClick={() => (stop(), setPhase(captured ? "done" : "idle"))} className={GHOST}>{t("camera.cancel")}</button>
          </>
        ) : null}
        {phase === "preview" || phase === "uploading" ? (
          <>
            <button type="button" onClick={confirm} disabled={phase === "uploading"} className={BTN}>{phase === "uploading" ? t("camera.sending") : t("camera.usePhoto")}</button>
            <button type="button" onClick={retake} disabled={phase === "uploading"} className={GHOST}>{t("camera.retake")}</button>
          </>
        ) : null}
      </div>
    </section>
  );
}

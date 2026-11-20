import "server-only";

import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { EXTENSION, UPLOAD_RULES, checkUpload, safeFileName, type UploadKind } from "@/lib/uploads";
import { stripImageMetadata } from "@/lib/image-metadata";

/**
 * Server half of uploads (feature 4). The browser never writes to storage:
 * this reads the file, checks its real type and size, and writes it with the
 * service role into "<owner uuid>/<random name>", so one account can neither
 * overwrite nor list another's files. Callers pass the session's profile id.
 */
export type StoredFile = { path: string; type: string; size: number };

export async function storeUpload(
  kind: UploadKind,
  ownerId: string,
  file: File,
): Promise<{ ok: true; file: StoredFile } | { ok: false; error: string; status: number }> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const check = checkUpload(kind, file.size, head);
  if (!check.ok) return { ok: false, error: check.error, status: check.error === "too_large" ? 413 : 415 };

  const rule = UPLOAD_RULES[kind];
  // A public image (an avatar is readable by anyone) never keeps its EXIF/GPS
  // metadata: it is stripped losslessly here, before the upload, so the
  // original bytes never reach the public bucket. A file that cannot be
  // parsed is refused rather than published as-is. Private documents are
  // stored untouched.
  let body: File | Uint8Array = file;
  let size = file.size;
  if (kind === "avatar") {
    const stripped = stripImageMetadata(new Uint8Array(await file.arrayBuffer()), check.type);
    if (!stripped) return { ok: false, error: "type", status: 415 };
    body = stripped.bytes;
    size = stripped.bytes.length;
    if (stripped.removed.length) log.info("upload.metadata_stripped", { kind, removed: stripped.removed.join(","), orientation: stripped.orientation });
  }
  const stem = kind === "avatar" ? "avatar" : safeFileName(file.name).replace(/\.[A-Za-z0-9]+$/, "").slice(0, 40) || "document";
  const path = `${ownerId}/${stem}-${randomBytes(6).toString("hex")}.${EXTENSION[check.type]}`;
  const { error } = await createAdminClient()
    .storage.from(rule.bucket)
    .upload(path, body, { contentType: check.type, upsert: false, cacheControl: "3600" });
  if (error) {
    log.error("upload.store_failed", { kind, error });
    return { ok: false, error: "storage_unavailable", status: 503 };
  }
  return { ok: true, file: { path, type: check.type, size } };
}

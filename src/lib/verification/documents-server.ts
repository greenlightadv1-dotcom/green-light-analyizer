import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { EXTENSION, sniffType } from "@/lib/uploads";
import type { VerificationCase, VerificationDocType } from "@/lib/types/database";
import { DOCUMENTS, EDITABLE, UPLOAD } from "./rules";
import { checkCameraJpeg, isCameraDocType } from "./camera";

/**
 * Store one verification document for a case the caller has already proved
 * they own (an account's own case, or an application through its resume
 * token). Shared by /api/verification/documents and /api/applications/documents
 * so the two can never drift apart.
 *
 * - The type is decided by the file's own bytes, never its name or declared type.
 * - Identity images (selfie, ID front, ID back) must be camera JPEGs:
 *   well-formed, no EXIF, within dimension bounds (lib/verification/camera.ts).
 *   The database refuses them otherwise, too.
 * - The object name is generated here: "<case uuid>/<random uuid>.<ext>".
 *   Nothing from the request reaches the path.
 * - Nothing here returns a URL. Only reviewers view documents, through a
 *   ≤5-minute signed URL that is itself recorded.
 */
export const BUCKET = "verification-docs";
const MAX_DOCS = 8;

export type StoreResult = { status: number; body: Record<string, unknown> };

export async function storeDocument(
  caseRow: Pick<VerificationCase, "id" | "kind" | "status">,
  docTypeRaw: string,
  file: unknown,
  captureRaw: string,
  actorId: string | null,
): Promise<StoreResult> {
  if (!EDITABLE.includes(caseRow.status)) return { status: 403, body: { error: "not_editable" } };
  const docType = docTypeRaw as VerificationDocType;
  if (!DOCUMENTS[caseRow.kind].allowed.includes(docType)) return { status: 400, body: { error: "doc_type" } };
  const camera = isCameraDocType(docType);
  // An identity image must arrive through the camera flow; an ordinary document must not claim to.
  if (camera !== (captureRaw === "camera")) return { status: 400, body: { error: "capture" } };
  if (!(file instanceof File) && !(file instanceof Blob)) return { status: 400, body: { error: "no_file" } };
  if (file.size === 0) return { status: 400, body: { error: "empty" } };
  if (file.size > UPLOAD.maxBytes) return { status: 413, body: { error: "too_large" } };

  const service = createAdminClient();
  const { count } = await service.from("verification_documents").select("id", { count: "exact", head: true }).eq("case_id", caseRow.id).is("removed_at", null);
  if ((count ?? 0) >= MAX_DOCS) return { status: 409, body: { error: "too_many" } };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffType(bytes.subarray(0, 16));
  if (!type || !(UPLOAD.mimes as readonly string[]).includes(type)) return { status: 415, body: { error: "type" } };
  if (camera) {
    const check = checkCameraJpeg(bytes);
    if (!check.ok) return { status: 415, body: { error: check.error } };
  }

  // A retake replaces the earlier image of the same kind.
  if (camera) {
    const { data: earlier } = await service.from("verification_documents").select("id, storage_path").eq("case_id", caseRow.id).eq("doc_type", docType).is("removed_at", null);
    for (const d of earlier ?? []) {
      await service.from("verification_documents").update({ removed_at: new Date().toISOString() }).eq("id", d.id);
      await service.storage.from(BUCKET).remove([d.storage_path]);
      await service.from("verification_events").insert({ case_id: caseRow.id, actor_id: actorId, event: "document_removed", detail: { doc_type: docType, reason: "retake" } });
    }
  }

  const path = `${caseRow.id}/${crypto.randomUUID()}.${EXTENSION[type]}`;
  const { error: upErr } = await service.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (upErr) {
    log.error("verification.upload_failed", { error: upErr });
    return { status: 503, body: { error: "storage_unavailable" } };
  }
  const { data: doc, error } = await service
    .from("verification_documents")
    .insert({ case_id: caseRow.id, doc_type: docType, storage_path: path, mime: type, size_bytes: bytes.length, capture_method: camera ? "camera" : "upload" })
    .select("id, doc_type, mime, size_bytes, uploaded_at, capture_method")
    .single();
  if (error || !doc) {
    await service.storage.from(BUCKET).remove([path]);
    log.error("verification.document_row_failed", { error });
    return { status: 503, body: { error: "storage_unavailable" } };
  }
  await service.from("verification_events").insert({ case_id: caseRow.id, actor_id: actorId, event: "document_added", detail: { doc_type: docType, capture: doc.capture_method } });
  return { status: 200, body: { document: doc } };
}

/** Remove one document of an editable case the caller owns (checked by `owns`). */
export async function removeDocument(id: string, owns: (caseId: string) => Promise<boolean>, actorId: string | null): Promise<StoreResult> {
  const service = createAdminClient();
  const { data: doc } = await service.from("verification_documents").select("id, case_id, storage_path, doc_type, removed_at").eq("id", id).maybeSingle();
  if (!doc || doc.removed_at || !(await owns(doc.case_id))) return { status: 403, body: { error: "not_editable" } };
  const { data: c } = await service.from("verification_cases").select("status").eq("id", doc.case_id).single();
  if (!c || !EDITABLE.includes(c.status)) return { status: 403, body: { error: "not_editable" } };
  const { error } = await service.from("verification_documents").update({ removed_at: new Date().toISOString() }).eq("id", doc.id);
  if (error) return { status: 503, body: { error: "storage_unavailable" } };
  await service.storage.from(BUCKET).remove([doc.storage_path]);
  await service.from("verification_events").insert({ case_id: doc.case_id, actor_id: actorId, event: "document_removed", detail: { doc_type: doc.doc_type } });
  return { status: 200, body: { ok: true } };
}

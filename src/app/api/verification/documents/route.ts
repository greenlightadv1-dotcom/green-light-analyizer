import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { EXTENSION, sniffType } from "@/lib/uploads";
import { DOCUMENTS, EDITABLE, UPLOAD } from "@/lib/verification/rules";
import type { Profile } from "@/lib/auth";
import type { VerificationDocType } from "@/lib/types/database";

/**
 * Verification documents (0032). Private bucket 'verification-docs'; this
 * route only accepts uploads to and removals from the caller's own editable
 * case. Nothing here ever returns a URL: only admins view documents, through
 * a ≤5-minute signed URL issued by an admin action that is itself audited.
 *
 * Unlike every other API, an account awaiting approval may use this route:
 * uploading its documents is how it gets approved. Banned accounts may not.
 */
const BUCKET = "verification-docs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DOCS = 8;

async function session(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.banned_at) return null;
  return profile;
}

async function ownEditableCase(profileId: string, caseId: string) {
  if (!UUID.test(caseId)) return null;
  const { data } = await createAdminClient().from("verification_cases").select("id, kind, status").eq("id", caseId).eq("profile_id", profileId).maybeSingle();
  return data && EDITABLE.includes(data.status) ? data : null;
}

export async function POST(request: Request) {
  const profile = await session();
  if (!profile) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  if (!(await consumeRateLimit("upload", profile.id)).allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const caseRow = await ownEditableCase(profile.id, String(form?.get("case_id") ?? ""));
  if (!caseRow) return NextResponse.json({ error: "not_editable" }, { status: 403 });
  const docType = String(form?.get("doc_type") ?? "") as VerificationDocType;
  if (!DOCUMENTS[caseRow.kind].allowed.includes(docType)) return NextResponse.json({ error: "doc_type" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (file.size > UPLOAD.maxBytes) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const admin = createAdminClient();
  const { count } = await admin.from("verification_documents").select("id", { count: "exact", head: true }).eq("case_id", caseRow.id).is("removed_at", null);
  if ((count ?? 0) >= MAX_DOCS) return NextResponse.json({ error: "too_many" }, { status: 409 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  // The type is decided by the file's own bytes, never its name or declared type.
  const type = sniffType(bytes.subarray(0, 16));
  if (!type || !(UPLOAD.mimes as readonly string[]).includes(type)) return NextResponse.json({ error: "type" }, { status: 415 });

  const path = `${caseRow.id}/${crypto.randomUUID()}.${EXTENSION[type]}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (upErr) {
    log.error("verification.upload_failed", { error: upErr });
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }
  const { data: doc, error } = await admin
    .from("verification_documents")
    .insert({ case_id: caseRow.id, doc_type: docType, storage_path: path, mime: type, size_bytes: file.size })
    .select("id, doc_type, mime, size_bytes, uploaded_at")
    .single();
  if (error || !doc) {
    await admin.storage.from(BUCKET).remove([path]);
    log.error("verification.document_row_failed", { error });
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }
  await admin.from("verification_events").insert({ case_id: caseRow.id, actor_id: profile.id, event: "document_added", detail: { doc_type: docType } });
  return NextResponse.json({ document: doc });
}

export async function DELETE(request: Request) {
  const profile = await session();
  if (!profile) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const admin = createAdminClient();
  const { data: doc } = await admin.from("verification_documents").select("id, case_id, storage_path, doc_type, removed_at").eq("id", id).maybeSingle();
  if (!doc || doc.removed_at || !(await ownEditableCase(profile.id, doc.case_id))) return NextResponse.json({ error: "not_editable" }, { status: 403 });
  const { error } = await admin.from("verification_documents").update({ removed_at: new Date().toISOString() }).eq("id", doc.id);
  if (error) return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  await admin.storage.from(BUCKET).remove([doc.storage_path]);
  await admin.from("verification_events").insert({ case_id: doc.case_id, actor_id: profile.id, event: "document_removed", detail: { doc_type: doc.doc_type } });
  return NextResponse.json({ ok: true });
}

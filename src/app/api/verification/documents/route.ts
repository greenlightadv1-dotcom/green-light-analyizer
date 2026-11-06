import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/rate-limit";
import { removeDocument, storeDocument } from "@/lib/verification/documents-server";
import type { Profile } from "@/lib/auth";

/**
 * Verification documents of an existing account's own case (0032). The
 * validation and storage rules live in lib/verification/documents-server.ts,
 * shared with the pre-account application route. Nothing here returns a URL.
 *
 * An account awaiting approval may use this route (uploading is how it gets
 * approved). Banned accounts may not.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function session(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.banned_at) return null;
  return profile;
}

async function ownCase(profileId: string, caseId: string) {
  if (!UUID.test(caseId)) return null;
  const { data } = await createAdminClient().from("verification_cases").select("id, kind, status").eq("id", caseId).eq("profile_id", profileId).maybeSingle();
  return data;
}

export async function POST(request: Request) {
  const profile = await session();
  if (!profile) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  if (!(await consumeRateLimit("upload", profile.id)).allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const form = await request.formData().catch(() => null);
  const caseRow = await ownCase(profile.id, String(form?.get("case_id") ?? ""));
  if (!caseRow) return NextResponse.json({ error: "not_editable" }, { status: 403 });
  const r = await storeDocument(caseRow, String(form?.get("doc_type") ?? ""), form?.get("file"), String(form?.get("capture") ?? ""), profile.id);
  return NextResponse.json(r.body, { status: r.status });
}

export async function DELETE(request: Request) {
  const profile = await session();
  if (!profile) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const r = await removeDocument(id, async (caseId) => !!(await ownCase(profile.id, caseId)), profile.id);
  return NextResponse.json(r.body, { status: r.status });
}

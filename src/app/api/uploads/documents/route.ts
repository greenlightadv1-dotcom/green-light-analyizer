import { NextResponse } from "next/server";
import { loadApiSession } from "@/lib/api-session";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeUpload } from "@/lib/upload-server";
import { UPLOAD_RULES, isOwnedPath } from "@/lib/uploads";

/**
 * Onboarding documents and Media Kit files (feature 4). Private bucket:
 * nothing is public, and each read is a signed URL valid for 60 seconds,
 * issued only for the caller's own folder — or, for an admin reviewing an
 * account, for the folder named by ?owner=<id>.
 */
const BUCKET = UPLOAD_RULES.document.bucket;
const MAX_FILES = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const session = await loadApiSession();
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const owner = new URL(request.url).searchParams.get("owner");
  let ownerId = session.profile.id;
  if (owner && owner !== ownerId) {
    if (session.profile.role !== "admin" || !UUID.test(owner)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    ownerId = owner;
  }
  const storage = createAdminClient().storage.from(BUCKET);
  const { data, error } = await storage.list(ownerId, { limit: MAX_FILES * 2, sortBy: { column: "created_at", order: "desc" } });
  if (error) return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  const files = await Promise.all(
    (data ?? [])
      .filter((f) => f.name && !f.name.startsWith("."))
      .map(async (f) => {
        const path = `${ownerId}/${f.name}`;
        const signed = await storage.createSignedUrl(path, 60);
        return { path, name: f.name, size: f.metadata?.size ?? null, url: signed.data?.signedUrl ?? null };
      }),
  );
  return NextResponse.json({ files });
}

export async function POST(request: Request) {
  const session = await loadApiSession();
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const { profile } = session;
  if (profile.role === "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const limit = await consumeRateLimit("upload", profile.id);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const existing = await createAdminClient().storage.from(BUCKET).list(profile.id, { limit: MAX_FILES + 1 });
  if ((existing.data ?? []).length >= MAX_FILES) return NextResponse.json({ error: "too_many" }, { status: 409 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });

  const stored = await storeUpload("document", profile.id, file);
  if (!stored.ok) return NextResponse.json({ error: stored.error }, { status: stored.status });
  return NextResponse.json({ file: stored.file });
}

export async function DELETE(request: Request) {
  const session = await loadApiSession();
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const path = new URL(request.url).searchParams.get("path") ?? "";
  // Only the owner deletes, and only inside their own folder.
  if (!isOwnedPath(session.profile.id, path)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { error } = await createAdminClient().storage.from(BUCKET).remove([path]);
  if (error) return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  return NextResponse.json({ ok: true });
}

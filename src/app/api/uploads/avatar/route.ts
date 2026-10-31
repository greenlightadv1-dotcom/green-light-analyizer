import { NextResponse } from "next/server";
import { loadApiSession } from "@/lib/api-session";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { storeUpload } from "@/lib/upload-server";
import { UPLOAD_RULES, ownedAvatarPath } from "@/lib/uploads";

/**
 * Profile picture upload / removal (feature 4). Any signed-in role may set
 * their own picture. The new file is stored first and the profile updated
 * after, so a failed update never leaves the profile pointing at nothing; the
 * previous picture is removed only if it is one of this owner's own objects.
 */
function publicBase(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${url}/storage/v1/object/public/${UPLOAD_RULES.avatar.bucket}/`;
}

export async function POST(request: Request) {
  const session = await loadApiSession();
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const { profile } = session;

  const limit = await consumeRateLimit("upload", profile.id);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });

  const stored = await storeUpload("avatar", profile.id, file);
  if (!stored.ok) return NextResponse.json({ error: stored.error }, { status: stored.status });

  const admin = createAdminClient();
  const url = `${publicBase()}${stored.file.path}`;
  const { error } = await admin.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
  if (error) {
    await admin.storage.from(UPLOAD_RULES.avatar.bucket).remove([stored.file.path]);
    log.error("upload.avatar_profile_failed", { error });
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  const previous = ownedAvatarPath(profile.id, profile.avatar_url, publicBase());
  if (previous && previous !== stored.file.path) {
    await admin.storage.from(UPLOAD_RULES.avatar.bucket).remove([previous]);
  }
  return NextResponse.json({ url });
}

export async function DELETE() {
  const session = await loadApiSession();
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const { profile } = session;
  const admin = createAdminClient();
  const previous = ownedAvatarPath(profile.id, profile.avatar_url, publicBase());
  const { error } = await admin.from("profiles").update({ avatar_url: null }).eq("id", profile.id);
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  if (previous) await admin.storage.from(UPLOAD_RULES.avatar.bucket).remove([previous]);
  return NextResponse.json({ ok: true });
}

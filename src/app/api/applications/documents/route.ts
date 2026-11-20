import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { currentApplication } from "@/lib/verification/application";
import { removeDocument, storeDocument } from "@/lib/verification/documents-server";

/**
 * Documents of a pre-account application (0032). The applicant has no
 * Supabase session: ownership is the resume token in the httpOnly cookie,
 * resolved by the database. The case id in the form only selects among that
 * application's own cases. Nothing here returns a URL.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const app = await currentApplication();
  if (!app) return NextResponse.json({ error: "no_application" }, { status: 401 });
  if (!(await consumeRateLimit("upload", `application:${app.request.id}`)).allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const form = await request.formData().catch(() => null);
  const caseId = String(form?.get("case_id") ?? "");
  const caseRow = UUID.test(caseId) ? app.cases.find((c) => c.id === caseId) : undefined;
  if (!caseRow) return NextResponse.json({ error: "not_editable" }, { status: 403 });
  const r = await storeDocument(caseRow, String(form?.get("doc_type") ?? ""), form?.get("file"), String(form?.get("capture") ?? ""), null);
  return NextResponse.json(r.body, { status: r.status });
}

export async function DELETE(request: Request) {
  const app = await currentApplication();
  if (!app) return NextResponse.json({ error: "no_application" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const r = await removeDocument(id, async (caseId) => app.cases.some((c) => c.id === caseId), null);
  return NextResponse.json(r.body, { status: r.status });
}

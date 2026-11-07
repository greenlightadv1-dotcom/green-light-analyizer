"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { clientKey } from "@/lib/client-key";
import { EDITABLE, parseDetails, verificationErrorKey } from "@/lib/verification/rules";
import { clearApplicationCookie, currentApplication, sendResumeLink } from "@/lib/verification/application";
import { OK, fail, type ActionResult } from "@/lib/ui/action-result";

/**
 * The applicant's actions before an account exists. Every one resolves the
 * application from the httpOnly resume cookie (the database checks the token)
 * and only then touches that application's own case. The case id in a form
 * is matched against the application's cases, never trusted on its own.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>()",;]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

async function ownCase(fd: FormData) {
  const app = await currentApplication();
  if (!app) return { app: null, c: null } as const;
  const id = String(fd.get("case_id") ?? "");
  const c = UUID.test(id) ? app.cases.find((x) => x.id === id) ?? null : null;
  return { app, c } as const;
}

export async function saveApplicationDetails(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { app, c } = await ownCase(fd);
  if (!app) return fail("apply.errors.no_application");
  if (!c) return fail("verification.errors.not_found");
  if (!EDITABLE.includes(c.status)) return fail("verification.errors.invalid_state");
  if (!(await consumeRateLimit("application_write", app.request.id)).allowed) return fail("verification.errors.rate_limited");
  const parsed = parseDetails(c.kind, Object.fromEntries(fd.entries()), { requireAll: false });
  if (!parsed.ok) return fail(`verification.fieldErrors.${parsed.field}`);
  const { error } = await createAdminClient()
    .from("verification_cases")
    .update({ details: parsed.value, updated_at: new Date().toISOString() })
    .eq("id", c.id)
    .eq("access_request_id", app.request.id)
    .in("status", EDITABLE);
  if (error) {
    log.error("application.save_failed", { error });
    return fail("ui.errors.generic");
  }
  revalidatePath("/apply");
  return OK;
}

/** Submit for review: every required field here, then the database checks documents and state. */
export async function submitApplication(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { app, c } = await ownCase(fd);
  if (!app) return fail("apply.errors.no_application");
  if (!c) return fail("verification.errors.not_found");
  if (fd.get("consent") !== "on") return fail("verification.errors.consent");
  if (!(await consumeRateLimit("application_write", app.request.id)).allowed) return fail("verification.errors.rate_limited");
  const parsed = parseDetails(c.kind, c.details ?? {}, { requireAll: true });
  if (!parsed.ok) return fail(`verification.fieldErrors.${parsed.field}`);
  const { error } = await createAdminClient().rpc("verification_transition", { p_actor: null, p_case: c.id, p_action: "submit" });
  if (error) {
    const key = verificationErrorKey(error.message);
    if (key === "ui.errors.generic") log.error("application.submit_failed", { error });
    return fail(key);
  }
  revalidatePath("/apply");
  return OK;
}

/** Forget the application on this device (the emailed link still works). */
export async function leaveApplication(): Promise<void> {
  await clearApplicationCookie();
  redirect("/get-started");
}

export type LinkState = { status: "idle" | "sent" | "invalid" | "rate_limited" };

/**
 * Ask for a new link. The same answer whether or not an open application
 * exists for the address, so this cannot be used to learn who has applied.
 */
export async function requestResumeLink(_prev: LinkState, fd: FormData): Promise<LinkState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return { status: "invalid" };
  if (!(await consumeRateLimit("access_request", await clientKey())).allowed) return { status: "rate_limited" };
  const service = createAdminClient();
  const { data } = await service.from("access_requests").select("id").eq("status", "pending").ilike("email", email).maybeSingle();
  if (data) await sendResumeLink(data.id, email);
  return { status: "sent" };
}

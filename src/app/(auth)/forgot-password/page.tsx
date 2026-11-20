import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { requestPasswordReset } from "./actions";

export const metadata: Metadata = { title: "Reset your password", referrer: "no-referrer", robots: { index: false } };

const PROBLEMS = new Set(["expired", "invalid", "browser"]);

/** Public. `?link=` carries why a recovery link could not be used (from /auth/recovery). */
export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  return <ForgotPasswordForm action={requestPasswordReset} linkProblem={link && PROBLEMS.has(link) ? (link as "expired" | "invalid" | "browser") : null} />;
}

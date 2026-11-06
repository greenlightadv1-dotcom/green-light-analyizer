import type { Metadata } from "next";
import { ActivateForm } from "@/components/apply/ActivateForm";

export const metadata: Metadata = { title: "Create your account · Preview" };

/** Demo only: the activation form with a dummy token; submitting does nothing. */
export default function PreviewActivate() {
  async function demo() {
    "use server";
    return { errorKey: "g.proposal.demo" };
  }
  return (
    <section className="mx-auto max-w-xl space-y-4 px-4 pt-8 pb-20 sm:px-6">
      <ActivateForm token={"A".repeat(43)} email="amir.demo@example.com" action={demo} />
    </section>
  );
}

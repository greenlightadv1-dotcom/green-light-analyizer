import type { Metadata } from "next";
import { GetStartedChooser } from "@/components/get-started/GetStartedChooser";
import { GetStartedShell } from "@/components/get-started/GetStartedShell";

export const metadata: Metadata = {
  title: "Get started",
  description: "Apply for a Green Light creator or company account. Every account is reviewed and created by our team.",
};

/** Public (session.ts PUBLIC_PATHS). Replaces the old Discord "Request access" link. */
export default function GetStartedPage() {
  return (
    <GetStartedShell>
      <GetStartedChooser />
    </GetStartedShell>
  );
}

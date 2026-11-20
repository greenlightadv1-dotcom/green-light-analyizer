import type { Metadata } from "next";
import { NewBriefView } from "@/components/collab/BriefsView";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "New brief" };

export default async function NewBriefPage() {
  await requireRole("company");
  return <NewBriefView />;
}

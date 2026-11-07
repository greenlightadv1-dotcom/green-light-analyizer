import type { Metadata } from "next";
import { BriefsView } from "@/components/collab/BriefsView";
import { previewBriefs } from "@/lib/preview/collab-mock";

export const metadata: Metadata = { title: "Briefs · Preview" };

export default function PreviewBriefs() {
  return <BriefsView newHref="/preview/briefs" briefs={previewBriefs.map((b, i) => ({ ...b, invitations: i === 0 ? 2 : 0 }))} />;
}

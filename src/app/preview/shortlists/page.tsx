import type { Metadata } from "next";
import { ShortlistsView } from "@/components/shortlists/ShortlistsView";
import { previewShortlists } from "@/lib/preview/collab-mock";

export const metadata: Metadata = { title: "Shortlists · Preview" };

export default function PreviewShortlists() {
  return <ShortlistsView lists={previewShortlists} />;
}

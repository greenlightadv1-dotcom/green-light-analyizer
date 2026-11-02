import type { Metadata } from "next";
import { ContentView } from "@/components/content/ContentView";
import { previewContent } from "@/lib/preview/collab-mock";

export const metadata: Metadata = { title: "Content plan · Preview" };

export default async function PreviewContent({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <ContentView
      demo
      basePath="/preview"
      items={previewContent}
      collaborations={[]}
      view={sp.view === "calendar" ? "calendar" : "board"}
      kind={null}
      year={2026}
      month={11}
    />
  );
}

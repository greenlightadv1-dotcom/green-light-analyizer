import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GetStartedShell } from "@/components/get-started/GetStartedShell";
import { JourneyPage } from "@/components/get-started/JourneyPage";
import { JOURNEYS, isJourney } from "@/lib/access-requests";

export const metadata: Metadata = { title: "Apply" };

export function generateStaticParams() {
  return JOURNEYS.map((journey) => ({ journey }));
}

export default async function JourneyRoute({ params }: { params: Promise<{ journey: string }> }) {
  const { journey } = await params;
  if (!isJourney(journey)) notFound();
  return (
    <GetStartedShell>
      <JourneyPage journey={journey} />
    </GetStartedShell>
  );
}

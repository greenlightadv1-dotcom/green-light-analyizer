import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { SectionHeader } from "@/components/dashboard/SectionHeader";

export const metadata: Metadata = { title: "Deal room" };

/**
 * Deal Chat Room. Structure only.
 *
 * Next pass, and none of these are optional:
 *   - Load the chat + messages, gated by RLS (0003_rls_policies.sql).
 *   - EVERY outgoing message passes through maskSensitiveData() in
 *     src/lib/mask.ts SERVER-SIDE before it is persisted (§6, §6.1) — the raw
 *     text must never reach the database or a company's client.
 *   - Log which rule matched, redacted, for admin review; a detected attempt to
 *     move the deal off-platform is a permanent ban (§6, §12).
 *   - A creator's reply is relayed to the company as an email from the
 *     platform's own sending address, never their real one.
 */
export default async function DealRoomPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;

  return (
    <>
      <SectionHeader
        title="Deal room"
        description="Contact details are stripped before a message is stored. Everything stays on-platform."
      />
      <EmptyState
        title={`Room ${chatId}`}
        spec="§6"
        body="Message thread, masked composer, deal status controls and the AI price/risk panel are the next build step. The masking utility it depends on is already implemented in src/lib/mask.ts."
      />
    </>
  );
}

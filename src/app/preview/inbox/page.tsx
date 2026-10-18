import type { Metadata } from "next";
import { InboxView } from "@/components/views/InboxView";
import { EMPTY_BODY_DETAIL, toHeldDeliveries, type HeldRow } from "@/lib/email/held";
import { mockChats } from "@/lib/preview/mock";

export const metadata: Metadata = { title: "Deal inbox · Preview" };

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/**
 * Raw rows, run through the REAL projection — not pre-masked strings. The
 * phone number and the WhatsApp link below are unmasked on purpose: the
 * preview then demonstrates the actual §6.1 masking, the way the composer's
 * demo mode uses the real maskSensitiveData rather than a stub. If masking
 * ever regressed, this page would show it.
 */
const mockHeldRows: HeldRow[] = [
  {
    id: "00000000-0000-4000-8000-0000000000h1",
    created_at: ago(1),
    sender_email: "digest@growthweekly.example",
    subject: "Your weekly creator digest — 5 brands hiring",
    detail: "screened out: carries mailing-list headers (List-Unsubscribe / List-ID)",
    spam_score: 0,
    spam_reasons: ["carries mailing-list headers (List-Unsubscribe / List-ID)"],
  },
  {
    id: "00000000-0000-4000-8000-0000000000h2",
    created_at: ago(3),
    sender_email: "no-reply@payments.example",
    subject: "Fast payout — message us on wa.me/201012345678",
    detail: "screened out: sent from an address that cannot receive replies",
    spam_score: 15,
    spam_reasons: ["sent from an address that cannot receive replies"],
  },
  {
    id: "00000000-0000-4000-8000-0000000000h3",
    created_at: ago(6),
    sender_email: "hello@lumenapp.example",
    subject: null,
    detail: EMPTY_BODY_DETAIL,
    spam_score: null,
    spam_reasons: null,
  },
];

export default function PreviewInbox() {
  return (
    <InboxView
      chats={mockChats}
      held={{ items: toHeldDeliveries(mockHeldRows), truncated: false }}
      basePath="/preview"
    />
  );
}

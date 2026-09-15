import "server-only";

/**
 * The address every platform email is sent from.
 *
 * One definition for both senders — the §6 relay in ./outbound.ts and the
 * template dispatcher in @/lib/resend. They used to carry separate defaults,
 * which is exactly how one of them ended up sending production mail from
 * Resend's shared sandbox domain while the other defaulted to a domain that
 * was never verified for sending.
 *
 * The fallback is the apex because that is the domain verified for sending in
 * Resend. The inbound subdomain (analyze.…) exists to *receive*; Resend
 * refuses a From address whose domain is not a verified sending domain, so
 * defaulting to it would fail every send rather than merely risk the spam
 * folder.
 *
 * Read per call rather than captured in a module-level const, so the value a
 * request sends from is the one currently in the environment — a const is
 * evaluated at import time, which made the old default impossible to override
 * for anything imported early.
 */
export function fromAddress(): string {
  return (
    process.env.RESEND_FROM_ADDRESS ?? "Green Light <deals@greenlightadvs.com>"
  );
}

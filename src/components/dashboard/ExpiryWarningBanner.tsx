import Link from "next/link";
import { daysUntil } from "@/lib/subscription";
import type { Profile } from "@/lib/auth";

/**
 * Warns a creator/company before their paid plan lapses back to Starter.
 *
 * Only ever renders in the 0-3 day window before subscription_expires_at.
 * Once it passes, requireProfile()'s own check resets the plan on the very
 * next request, and this banner naturally stops showing — there is nothing
 * separate to reconcile.
 */
export function ExpiryWarningBanner({ profile }: { profile: Profile }) {
  if (!profile.subscription_expires_at) return null;

  const days = daysUntil(profile.subscription_expires_at);
  if (days < 0 || days > 3) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-2.5 text-xs leading-relaxed text-amber-700 dark:text-amber-100">
      <p>
        Your {profile.subscription_plan} plan{" "}
        {days === 0 ? "expires today" : `expires in ${days} day${days === 1 ? "" : "s"}`}{" "}
        — renew via Discord or redeem a promo code before it falls back to
        Starter.
      </p>
      <Link
        href="/settings"
        className="shrink-0 font-medium text-amber-700 dark:text-amber-100 underline underline-offset-2 hover:text-fg"
      >
        Go to Settings
      </Link>
    </div>
  );
}

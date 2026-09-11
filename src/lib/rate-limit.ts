import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rate limiting for the actions that cost money per click.
 *
 * Every action below spends at least one NVIDIA call when a user presses a
 * button, and the Manual Analyzer additionally spends a WHOIS lookup and a
 * Safe Browsing call. None of them had any ceiling.
 *
 * This is an abuse and cost guard, deliberately distinct from the §8 plan
 * quotas ("5 email analyses/mo" on Starter, unlimited on Pro). Those are a
 * billing rule about what a plan entitles someone to; these are a technical
 * rule about what any one account can do to the bill in an hour. The plan
 * quota is not implemented yet — adding it here would conflate the two and
 * silently give Starter a limit nobody agreed to.
 *
 * The counter lives in Postgres (migration 0019) because the app is
 * serverless: a module-level Map is per-instance and per-cold-start, so on
 * Vercel it would let through roughly as many requests as there are warm
 * instances, while looking like it worked in local development.
 */

export type RateLimitAction =
  | "ai_analyze_offer"
  | "ai_offer_preview"
  | "ai_reply_draft"
  | "ai_detect_niche";

type Rule = { limit: number; windowSeconds: number; label: string };

const HOUR = 3600;
const DAY = 86_400;

/**
 * Two windows per action: an hourly rule that stops a burst, and a daily one
 * that stops a slow drip from adding up to the same bill. The hourly limits
 * are set well above what the interaction actually looks like — analysing a
 * dozen offers in an hour is already an unusual day for one creator — so a
 * real user should never meet them.
 */
const RULES: Record<RateLimitAction, Rule[]> = {
  ai_analyze_offer: [
    { limit: 12, windowSeconds: HOUR, label: "hour" },
    { limit: 50, windowSeconds: DAY, label: "day" },
  ],
  ai_offer_preview: [
    { limit: 20, windowSeconds: HOUR, label: "hour" },
    { limit: 100, windowSeconds: DAY, label: "day" },
  ],
  ai_reply_draft: [
    { limit: 20, windowSeconds: HOUR, label: "hour" },
    { limit: 100, windowSeconds: DAY, label: "day" },
  ],
  ai_detect_niche: [
    { limit: 10, windowSeconds: HOUR, label: "hour" },
    { limit: 30, windowSeconds: DAY, label: "day" },
  ],
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; message: string };

/** "in about 20 minutes" beats "retry_after_seconds: 1187" for someone reading an error. */
function humanizeWait(seconds: number): string {
  if (seconds <= 60) return "in under a minute";
  if (seconds < HOUR) return `in about ${Math.ceil(seconds / 60)} minutes`;
  const hours = Math.round(seconds / HOUR);
  return hours <= 1 ? "in about an hour" : `in about ${hours} hours`;
}

/**
 * Consume one unit for `action` on behalf of `subjectId` (a profile id).
 *
 * Fails **closed**: if the counter cannot be read, the action is refused. The
 * usual argument for failing open — don't let the guard take down the feature —
 * does not apply here, because the only store that can fail is the same
 * Postgres every one of these actions needs anyway. A request that cannot
 * reach it was never going to succeed; failing open would just mean the one
 * request that skips the limiter is the one arriving during an outage.
 *
 * Note that when an action has several rules and a later one rejects, the
 * earlier ones have already counted the attempt. That over-counts a rejected
 * request slightly, in the direction of being stricter, which is the safe
 * direction for a cost guard.
 */
export async function consumeRateLimit(
  action: RateLimitAction,
  subjectId: string,
): Promise<RateLimitResult> {
  const admin = createAdminClient();

  for (const rule of RULES[action]) {
    const key = `${action}:${rule.windowSeconds}:${subjectId}`;

    const { data, error } = await admin.rpc("consume_rate_limit", {
      p_key: key,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });

    const row = data?.[0];

    if (error || !row) {
      console.error(
        `rate-limit: could not consume ${action} for ${subjectId}`,
        error?.message ?? "no row returned",
      );
      return {
        allowed: false,
        retryAfterSeconds: 60,
        message: "We couldn't verify your usage limit just now. Try again in a moment.",
      };
    }

    if (!row.allowed) {
      return {
        allowed: false,
        retryAfterSeconds: row.retry_after_seconds,
        message: `You've used this ${rule.limit} times this ${rule.label}. Try again ${humanizeWait(row.retry_after_seconds)}.`,
      };
    }
  }

  return { allowed: true };
}

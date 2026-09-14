import "server-only";

/**
 * Discord webhook notifications for ops events — Supabase database changes,
 * GitHub activity, and deploys. Each source posts to its own Discord channel
 * via its own webhook URL (a Discord webhook URL *is* a bearer credential for
 * that channel — the token lives in the URL itself — so each is read from its
 * own env var here and never logged or echoed back to a caller).
 *
 * Fire-and-forget by design: a notification failing (missing config, Discord
 * down, a dead webhook URL) must never break the operation that triggered it
 * — the same "degrade quietly, record it, don't throw" convention as the
 * Resend relay (§6) and the AI evaluation fallback (§9) elsewhere in this
 * codebase.
 */

export type DiscordChannel = "supabase" | "github" | "deploys";
export type DiscordLogStatus = "success" | "info" | "warning" | "error";

export interface DiscordLogField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordLogOptions {
  channel: DiscordChannel;
  title: string;
  description?: string;
  /** Defaults to "info". */
  status?: DiscordLogStatus;
  fields?: DiscordLogField[];
  /** Optional link the embed title points to (a commit, a PR, a deployment). */
  url?: string;
}

export type DiscordLogResult = { ok: true } | { ok: false; reason: string };

const WEBHOOK_ENV_VARS: Record<DiscordChannel, string> = {
  supabase: "DISCORD_SUPABASE_WEBHOOK_URL",
  github: "DISCORD_GITHUB_WEBHOOK_URL",
  deploys: "DISCORD_DEPLOYS_WEBHOOK_URL",
};

const CHANNEL_LABELS: Record<DiscordChannel, string> = {
  supabase: "Supabase",
  github: "GitHub",
  deploys: "Deploys",
};

// Brand palette (CLAUDE.md §2.1) doubles as the success/info colors; warning
// and error use Discord's own semantic colors so an alert reads as urgent
// rather than on-brand.
const STATUS_COLORS: Record<DiscordLogStatus, number> = {
  success: 0x62e823, // brand green
  info: 0x293e61, // brand navy
  warning: 0xfaa61a,
  error: 0xed4245,
};

// Discord embed limits — developers.discord.com/docs/resources/message#embed-object-embed-limits.
const TITLE_MAX = 256;
const DESCRIPTION_MAX = 4096;
const FIELD_NAME_MAX = 256;
const FIELD_VALUE_MAX = 1024;
const FIELDS_MAX = 25;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Posts one rich embed to the Discord channel mapped to `channel`. Resolves
 * with `{ ok: false, ... }` rather than throwing when the webhook isn't
 * configured or Discord rejects/can't be reached — callers may inspect the
 * result, but are never required to handle it as an error.
 */
export async function sendDiscordLog(options: DiscordLogOptions): Promise<DiscordLogResult> {
  const envVar = WEBHOOK_ENV_VARS[options.channel];
  const webhookUrl = process.env[envVar];

  if (!webhookUrl) {
    console.warn(`discord logger: ${envVar} is not set — skipping "${options.title}"`);
    return { ok: false, reason: "not configured" };
  }

  const status = options.status ?? "info";
  const fields = (options.fields ?? []).slice(0, FIELDS_MAX).map((field) => ({
    name: truncate(field.name, FIELD_NAME_MAX),
    value: truncate(field.value, FIELD_VALUE_MAX),
    inline: field.inline ?? false,
  }));

  const embed = {
    title: truncate(options.title, TITLE_MAX),
    description: options.description ? truncate(options.description, DESCRIPTION_MAX) : undefined,
    url: options.url,
    color: STATUS_COLORS[status],
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: `Green Light · ${CHANNEL_LABELS[options.channel]}` },
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) {
      const reason = `Discord returned ${response.status}`;
      console.error(`discord logger: ${reason} for "${options.title}"`);
      return { ok: false, reason };
    }

    return { ok: true };
  } catch (error) {
    console.error(`discord logger: failed to reach Discord for "${options.title}"`, error);
    return { ok: false, reason: "network error" };
  }
}

import { ThemedLogo } from "@/components/landing/ThemedLogo";
import {
  DISCORD_INVITE_URL,
  WHATSAPP_PHONE,
  WHATSAPP_URL,
} from "@/lib/constants/contact";

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.1.2-.3.2-.6.1-.3-.1-1.2-.4-2.2-1.4-.8-.7-1.4-1.6-1.5-1.9-.2-.3 0-.5.1-.6l.4-.5c.1-.1.2-.3.2-.4.1-.2 0-.3 0-.4L10 7.7c-.1-.3-.3-.3-.5-.3h-.4c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s1 2.5 1.1 2.7c.1.2 2 3 4.7 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.4.2-.6.2-1.2.2-1.3-.1-.2-.3-.2-.6-.4Z" />
      <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2Z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M20.3 5.4A17.6 17.6 0 0 0 15.9 4c-.2.4-.4.9-.6 1.3a16.3 16.3 0 0 0-4.7 0A8.2 8.2 0 0 0 10 4a17.6 17.6 0 0 0-4.4 1.4C2.9 9.1 2.2 12.7 2.5 16.3a17.7 17.7 0 0 0 5.4 2.7c.4-.6.8-1.2 1.1-1.9-.6-.2-1.2-.5-1.8-.9l.4-.3a12.6 12.6 0 0 0 10.8 0l.4.3c-.6.4-1.2.7-1.8.9.3.7.7 1.3 1.1 1.9a17.6 17.6 0 0 0 5.4-2.7c.4-4.2-.7-7.7-2.2-10.9ZM9.7 14.2c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.7 1.7-1.5 1.7Zm4.6 0c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.7 1.7-1.5 1.7Z" />
    </svg>
  );
}

export function ContactFooter() {
  return (
    <footer className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
      <div className="flex flex-col items-center gap-6 rounded-2xl border border-navy/10 bg-white/70 px-6 py-8 text-center backdrop-blur-xl sm:flex-row sm:justify-between sm:text-left dark:border-white/10 dark:bg-navy-dark/50">
        <div className="flex items-center gap-3">
          <ThemedLogo height={24} />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-end">
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-navy/15 bg-navy/5 px-3 py-1.5 text-xs text-ink transition hover:bg-navy/10 dark:border-white/15 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <WhatsAppIcon />
            {WHATSAPP_PHONE}
          </a>
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-navy/15 bg-navy/5 px-3 py-1.5 text-xs text-ink transition hover:bg-navy/10 dark:border-white/15 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <DiscordIcon />
            Join our Discord
          </a>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-ink/35 dark:text-white/30">
        © {new Date().getFullYear()} Green Light. All rights reserved.
      </p>
    </footer>
  );
}

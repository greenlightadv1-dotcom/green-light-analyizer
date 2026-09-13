import type { ReactNode } from "react";

export type SocialPlatform = "youtube" | "tiktok" | "instagram";

type PlatformConfig = {
  id: SocialPlatform;
  name: string;
  description: string;
  connectHref: string;
  iconClassName: string;
  icon: ReactNode;
};

const PLATFORMS: PlatformConfig[] = [
  {
    id: "youtube",
    name: "YouTube",
    description: "Channel stats and audience insights",
    connectHref: "/api/auth/connect/youtube",
    iconClassName: "bg-[#FF0000]/10 text-[#FF0000]",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8ZM9.5 15.6V8.4l6.3 3.6-6.3 3.6Z" />
      </svg>
    ),
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "Post performance and follower counts",
    connectHref: "/api/auth/connect/tiktok",
    iconClassName: "bg-black/5 text-black dark:bg-white/10 dark:text-white",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path d="M16.6 5.8a4.8 4.8 0 0 1-1-.9 5 5 0 0 1-1.2-2.7h-3.3v12.9a2.9 2.9 0 1 1-2-2.7V8.9a6.2 6.2 0 1 0 5.3 6.1V8.6a8.2 8.2 0 0 0 4.8 1.5V6.8a4.8 4.8 0 0 1-2.6-1Z" />
      </svg>
    ),
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Business or Creator account, via Meta",
    connectHref: "/api/auth/connect/meta",
    iconClassName: "bg-[#E1306C]/10 text-[#E1306C]",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.8s0 3.5-.1 4.8c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4a3.9 3.9 0 0 1-1.4-.9 3.9 3.9 0 0 1-.9-1.4c-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.8s0-3.5.1-4.8c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.9-.1Zm0 1.8c-3.1 0-3.5 0-4.7.1-1.1.1-1.7.2-2.1.3-.5.2-.9.4-1.2.8-.4.3-.6.7-.8 1.2-.1.4-.3 1-.3 2.1-.1 1.2-.1 1.6-.1 4.7s0 3.5.1 4.7c.1 1.1.2 1.7.3 2.1.2.5.4.9.8 1.2.3.4.7.6 1.2.8.4.1 1 .3 2.1.3 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1.1-.1 1.7-.2 2.1-.3.5-.2.9-.4 1.2-.8.4-.3.6-.7.8-1.2.1-.4.3-1 .3-2.1.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c-.1-1.1-.2-1.7-.3-2.1a3.2 3.2 0 0 0-.8-1.2 3.2 3.2 0 0 0-1.2-.8c-.4-.1-1-.3-2.1-.3-1.2-.1-1.6-.1-4.7-.1Zm0 3.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8Zm0 8a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Zm6.3-8.2a1.2 1.2 0 1 1-2.3 0 1.2 1.2 0 0 1 2.3 0Z" />
      </svg>
    ),
  },
];

function StatusBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#62E823]/15 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:text-[#62E823]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#62E823]" aria-hidden />
      Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-black/50 dark:bg-white/10 dark:text-white/50">
      <span className="h-1.5 w-1.5 rounded-full bg-black/25 dark:bg-white/30" aria-hidden />
      Disconnected
    </span>
  );
}

/**
 * Plain <a> rather than next/link on purpose: these targets are API routes
 * that answer with a 302 to the provider's consent screen, so the navigation
 * has to leave the client router entirely.
 */
export function SocialConnections({
  connections = {},
}: {
  connections?: Partial<Record<SocialPlatform, boolean>>;
}) {
  return (
    <section aria-labelledby="social-accounts-heading">
      <h2
        id="social-accounts-heading"
        className="text-base font-semibold text-black dark:text-white"
      >
        Social accounts
      </h2>
      <p className="mt-1 text-sm text-black/55 dark:text-white/55">
        Connect a platform to pull your stats straight from its API.
      </p>

      <ul className="mt-5 space-y-3">
        {PLATFORMS.map((platform) => {
          const connected = connections[platform.id] === true;

          return (
            <li
              key={platform.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-black/10 bg-white/60 p-4 transition hover:border-black/20 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${platform.iconClassName}`}
              >
                {platform.icon}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-black dark:text-white">
                    {platform.name}
                  </span>
                  <StatusBadge connected={connected} />
                </div>
                <p className="mt-0.5 truncate text-xs text-black/50 dark:text-white/45">
                  {platform.description}
                </p>
              </div>

              <a
                href={platform.connectHref}
                aria-label={
                  connected
                    ? `Reconnect ${platform.name}`
                    : `Connect ${platform.name}`
                }
                className={
                  connected
                    ? "ms-auto inline-flex items-center justify-center rounded-lg border border-black/15 px-3.5 py-2 text-xs font-medium text-black/70 transition hover:bg-black/5 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10"
                    : "ms-auto inline-flex items-center justify-center rounded-lg bg-[#62E823] px-3.5 py-2 text-xs font-semibold text-[#231F20] transition hover:brightness-95"
                }
              >
                {connected ? "Reconnect" : "Connect"}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

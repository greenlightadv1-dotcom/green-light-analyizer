"use client";

import { ThemedLogo } from "@/components/brand/ThemedLogo";
import { ThemeMenu } from "@/components/ui/ThemeMenu";
import { LanguageMenu } from "@/components/ui/LanguageMenu";
import { useTranslation } from "@/components/LocaleProvider";
import type { Profile } from "@/lib/auth";

export function TopBar({
  profile,
  demo = false,
}: {
  profile: Profile;
  /** UI preview: render the bar without a working sign-out. */
  demo?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <header className="glass-panel-solid mb-5 flex items-center justify-between gap-4 px-4 py-2.5">
      <div className="lg:hidden">
        <ThemedLogo size={30} />
      </div>

      <div className="hidden min-w-0 lg:block">
        <p className="truncate text-sm font-medium text-fg">
          {profile.full_name}
        </p>
        <p className="text-xs text-fg/45 capitalize">
          {profile.role} · {profile.subscription_plan ?? "Starter"}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <LanguageMenu />
        <ThemeMenu />

        <form action={demo ? undefined : "/auth/signout"} method="post">
          <button
            type={demo ? "button" : "submit"}
            className="rounded-lg border border-fg/10 bg-fg/5 px-3 py-1.5 text-xs text-fg/70 transition hover:bg-fg/10 hover:text-fg"
          >
            {t("topbar.signOut")}
          </button>
        </form>
      </div>
    </header>
  );
}

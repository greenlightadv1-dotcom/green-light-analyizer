"use client";

import { useTranslation } from "@/components/LocaleProvider";
import { signOutG } from "@/components/g/events";

export function SignOutButton() {
  const { t } = useTranslation();
  return (
    <form action="/auth/signout" method="post" onSubmit={signOutG}>
      <button type="submit" className="rounded-lg border border-line bg-surface-muted px-3 py-1.5 text-xs text-fg-secondary hover:text-fg focus-visible:focus-ring">
        {t("topbar.signOut")}
      </button>
    </form>
  );
}

import { Logo } from "@/components/brand/Logo";
import type { Profile } from "@/lib/auth";

export function TopBar({
  profile,
  demo = false,
}: {
  profile: Profile;
  /** UI preview: render the bar without a working sign-out. */
  demo?: boolean;
}) {
  return (
    <header className="glass-panel-solid mb-6 flex items-center justify-between gap-4 px-4 py-3">
      <div className="lg:hidden">
        <Logo variant="dark" height={26} />
      </div>

      <div className="hidden min-w-0 lg:block">
        <p className="truncate text-sm font-medium text-white">
          {profile.full_name}
        </p>
        <p className="text-xs text-white/45 capitalize">
          {profile.role} · {profile.subscription_plan ?? "Starter"}
        </p>
      </div>

      <form action={demo ? undefined : "/auth/signout"} method="post">
        <button
          type={demo ? "button" : "submit"}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}

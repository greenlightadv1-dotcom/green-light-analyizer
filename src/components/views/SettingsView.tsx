import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { InboundAliasCard } from "@/components/settings/InboundAliasCard";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { RedeemCodeForm } from "@/app/(app)/settings/RedeemCodeForm";
import { DISCORD_INVITE_URL } from "@/lib/constants/contact";
import type { Profile } from "@/lib/auth";

/** Settings, presentation only. Shared with /preview. */
export function SettingsView({
  profile,
  demo = false,
}: {
  profile: Profile;
  demo?: boolean;
}) {

  return (
    <>
      <SectionHeader
        title="Settings"
        description="Account, email intake and billing."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassPanel className="p-6">
          <h2 className="text-sm font-semibold text-fg">Account</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-fg/45">Name</dt>
              <dd className="text-fg">{profile.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg/45">Email</dt>
              {/*
                Safe here: this is the creator viewing their OWN profile. This
                value must never be rendered in a company's view of the product
                (§6, §12) — enforced by RLS, not by remembering not to.
              */}
              <dd className="text-fg">{profile.primary_email}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg/45">Role</dt>
              <dd className="text-fg capitalize">{profile.role}</dd>
            </div>
          </dl>
        </GlassPanel>

        {/* §4.3 — no in-app billing UI in the MVP. Surface the Discord CTA. */}
        <GlassPanel className="flex flex-col p-6">
          <h2 className="text-sm font-semibold text-fg">Plan & billing</h2>
          <p className="mt-1.5 text-sm text-fg/50">
            You are on the{" "}
            <span className="text-brand-green">
              {profile.subscription_plan ?? "Starter"}
            </span>{" "}
            plan.
            {profile.subscription_expires_at ? (
              <>
                {" "}
                It ends{" "}
                {new Date(profile.subscription_expires_at).toLocaleDateString()}
                .
              </>
            ) : null}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-fg/45">
            Upgrades, downgrades and payment confirmation are handled by our
            team over Discord — Vodafone Cash, InstaPay and Meeza for MENA,
            PayPal or crypto internationally.
          </p>

          <RedeemCodeForm demo={demo} />

          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center text-xs text-brand-green underline underline-offset-2 hover:brightness-110"
          >
            Open a ticket in our Discord
          </a>
        </GlassPanel>

        <div className="lg:col-span-2">
          <InboundAliasCard alias={profile.inbound_alias} />
        </div>
      </div>
    </>
  );
}

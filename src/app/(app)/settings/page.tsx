import type { Metadata } from "next";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { InboundAliasCard } from "@/components/settings/InboundAliasCard";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const profile = await requireProfile();

  return (
    <>
      <SectionHeader
        title="Settings"
        description="Account, email intake and billing."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassPanel className="p-6">
          <h2 className="text-sm font-semibold text-white">Account</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-white/45">Name</dt>
              <dd className="text-white">{profile.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-white/45">Email</dt>
              {/*
                Safe here: this is the creator viewing their OWN profile. This
                value must never be rendered in a company's view of the product
                (§6, §12) — enforced by RLS, not by remembering not to.
              */}
              <dd className="text-white">{profile.primary_email}</dd>
            </div>
            <div>
              <dt className="text-xs text-white/45">Role</dt>
              <dd className="text-white capitalize">{profile.role}</dd>
            </div>
          </dl>
        </GlassPanel>

        {/* §4.3 — no in-app billing UI in the MVP. Surface the Discord CTA. */}
        <GlassPanel className="flex flex-col p-6">
          <h2 className="text-sm font-semibold text-white">Plan & billing</h2>
          <p className="mt-1.5 text-sm text-white/50">
            You are on the{" "}
            <span className="text-brand-green">
              {profile.subscription_plan ?? "Starter"}
            </span>{" "}
            plan.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/45">
            Upgrades, downgrades and payment confirmation are handled by our
            team over Discord — Vodafone Cash, InstaPay and Meeza for MENA,
            PayPal or crypto internationally.
          </p>
          <p className="mt-auto pt-5 text-xs text-white/35">
            Discord invite link to be supplied by the client.
          </p>
        </GlassPanel>

        <div className="lg:col-span-2">
          <InboundAliasCard alias={profile.inbound_alias} />
        </div>
      </div>
    </>
  );
}

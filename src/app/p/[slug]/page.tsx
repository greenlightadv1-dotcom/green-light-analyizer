import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { ThemedLogo } from "@/components/brand/ThemedLogo";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";
import { PLATFORM_LABELS } from "@/lib/media-kit/platforms";
import type { CreatorPublicProfile } from "@/lib/types/database";

/**
 * Public shareable profile — greenlight.com/p/<slug> (§ Media Kit's
 * "Shareable Profile Link generator"). Reachable signed-out, on purpose: this
 * is what a creator sends a sponsor. Reads exclusively through
 * public.creator_public_profile() (migration 0017), a SECURITY DEFINER RPC
 * whose column list is fixed in its own SQL — there is no query shape here
 * that could reach primary_email, inbound_alias, role or subscription data.
 */

async function fetchProfile(slug: string): Promise<CreatorPublicProfile | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("creator_public_profile", { p_slug: slug });
    return data?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = await fetchProfile(slug);
  return { title: profile ? `${profile.full_name} — Green Light` : "Profile not found" };
}

const SOCIAL_ORDER = ["youtube", "instagram", "tiktok", "x", "twitch"] as const;
const SOCIAL_LABELS: Record<(typeof SOCIAL_ORDER)[number], string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
  twitch: "Twitch",
};

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await fetchProfile(slug);
  if (!profile) notFound();

  const socialEntries = SOCIAL_ORDER.filter((key) => profile.social_links?.[key]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-4 py-12">
      <ThemedLogo size={40} />

      <GlassPanel className="mt-8 w-full p-8 text-center">
        <div className="mx-auto h-20 w-20 overflow-hidden rounded-full border border-fg/10 bg-fg/5">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary external URL, see CreatorProfileCard.
            <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-fg/30">
              {profile.full_name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <h1 className="mt-4 text-xl font-semibold text-fg">{profile.full_name}</h1>

        <p className="mt-1 text-xs text-fg/45">
          {[profile.country, profile.primary_language].filter(Boolean).join(" · ") || null}
        </p>

        {profile.bio ? (
          <p className="mt-4 text-sm leading-relaxed text-fg/70">{profile.bio}</p>
        ) : null}

        {profile.platforms?.length ? (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {profile.platforms.map((platform) => (
              <span
                key={platform}
                className="rounded-md border border-fg/10 bg-fg/5 px-2.5 py-1 text-xs text-fg/60"
              >
                {PLATFORM_LABELS[platform]}
              </span>
            ))}
          </div>
        ) : null}

        {socialEntries.length ? (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {socialEntries.map((key) => (
              <span
                key={key}
                className="rounded-lg border border-fg/10 bg-fg/5 px-3 py-1.5 text-xs text-fg/70"
              >
                {SOCIAL_LABELS[key]}: {profile.social_links?.[key]}
              </span>
            ))}
          </div>
        ) : null}

        {profile.base_rate_usd !== null ? (
          <p className="mt-6 rounded-xl border border-brand-green/25 bg-brand-green/8 px-4 py-2.5 text-sm font-semibold text-brand-green">
            ${profile.base_rate_usd.toLocaleString("en-US")}+
          </p>
        ) : null}
      </GlassPanel>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-fg/30">
        Sponsorship offers for {profile.full_name} go through Green Light — real
        contact details stay private, and every negotiation happens on-platform.
      </p>
    </div>
  );
}

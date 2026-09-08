import { EmptyState } from "@/components/dashboard/EmptyState";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { CountryShareList } from "@/components/media-kit/CountryShareList";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { OfferPanel } from "@/app/(app)/discover/OfferPanel";
import type { CreatorDirectoryEntry } from "@/lib/types/database";

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  kick: "Kick",
  instagram: "Instagram",
};

function formatViews(n: number | null) {
  if (n === null) return "reach not listed yet";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M avg views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K avg views`;
  return `${n} avg views`;
}

/**
 * Company-facing creator browse list (§3), built on `creator_directory()` —
 * a SECURITY DEFINER RPC, not a table read (migration 0010). Every field
 * here came back from that function's own hardcoded column list, so there is
 * nothing to accidentally over-fetch: primary_email and inbound_alias were
 * never in the result set to begin with.
 */
export function DiscoverView({
  creators,
}: {
  creators: CreatorDirectoryEntry[];
}) {
  return (
    <>
      <SectionHeader
        title="Discover creators"
        description="Every reach and engagement figure here is what the creator has disclosed — self-reported unless the verified badge says otherwise (§7.2)."
      />

      {creators.length === 0 ? (
        <EmptyState
          title="No creators yet"
          spec="§3"
          body="Once an admin creates creator accounts and they fill in a media kit, they'll be listed here for you to browse and offer deals to."
        />
      ) : (
        <div className="space-y-3">
          {creators.map((creator) => (
            <GlassPanel key={creator.creator_id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg">
                    {creator.full_name}
                  </p>
                  <p className="mt-0.5 text-xs text-fg/45">
                    {creator.content_category ?? "Category not set"}
                    {creator.content_language
                      ? ` · ${creator.content_language}`
                      : ""}
                    {" · "}
                    {formatViews(creator.avg_views)}
                  </p>
                  <p className="mt-1 text-xs text-fg/35">
                    {creator.platforms?.length
                      ? creator.platforms
                          .map((p) => PLATFORM_LABELS[p] ?? p)
                          .join(", ")
                      : "No platforms connected yet"}
                  </p>
                </div>

                <OfferPanel
                  creatorId={creator.creator_id}
                  creatorName={creator.full_name}
                />
              </div>

              <div className="mt-4 border-t border-fg/8 pt-4">
                <CountryShareList
                  shares={
                    creator.audience_verified
                      ? creator.verified_top_countries
                      : creator.declared_top_countries
                  }
                  verified={creator.audience_verified}
                  emptyHint="No audience geography on file yet."
                />
              </div>
            </GlassPanel>
          ))}
        </div>
      )}
    </>
  );
}

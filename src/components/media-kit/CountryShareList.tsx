import { VerifiedTag } from "@/components/deals/VerifiedTag";
import type { CountryShare } from "@/lib/types/database";

/**
 * Audience geography, always with its provenance attached (§7.2).
 *
 * There is no way to render this component without a verified/self-reported
 * tag next to it — that is the whole reason it exists rather than a plain list.
 */
export function CountryShareList({
  shares,
  verified,
  emptyHint,
}: {
  shares: CountryShare[] | null;
  verified: boolean;
  emptyHint: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium tracking-wide text-white/70 uppercase">
          Audience geography
        </h3>
        <VerifiedTag verified={verified} />
      </div>

      {!shares?.length ? (
        <p className="mt-2.5 text-xs leading-relaxed text-white/40">
          {emptyHint}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {shares.map((share) => (
            <li key={share.country} className="flex items-center gap-3">
              <span className="w-7 font-mono text-xs text-white/70">
                {share.country}
              </span>
              <span
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8"
                role="presentation"
              >
                <span
                  className={`block h-full rounded-full ${
                    verified ? "bg-brand-green" : "bg-amber-300/70"
                  }`}
                  style={{ width: `${Math.min(share.pct, 100)}%` }}
                />
              </span>
              <span className="w-10 text-right text-xs text-white/60 tabular-nums">
                {share.pct}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

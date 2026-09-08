"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { saveMediaKit, type MediaKitState } from "@/lib/media-kit/actions";
import { formatCountryShares } from "@/lib/media-kit/countries";
import { PLATFORM_LABELS } from "@/lib/media-kit/platforms";
import type { MediaKit } from "@/lib/media-kit/queries";
import type { CountryShare, Platform } from "@/lib/types/database";

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-auto px-5">
      {pending ? "Saving…" : label}
    </Button>
  );
}

/**
 * The editable half of a platform card: everything §7.1 asks a creator to
 * supply. Verified fields are not here and cannot be — the RLS column grants
 * withhold them from the browser's identity entirely (§7.2).
 */
export function PlatformCard({
  platform,
  kit,
  locked,
  lockReason,
  verifiedGeoConnected = false,
}: {
  platform: Platform;
  kit: MediaKit | null;
  /** True when the §8 connection limit blocks adding this new platform. */
  locked: boolean;
  lockReason?: string;
  /**
   * True once a real OAuth connection (youtube/instagram) supplies
   * verified_top_countries for this kit. Replaces the manual "Where your
   * audience is" field with a note pointing at the verified data shown
   * below — everything else here (reach, category, language) stays
   * editable, since no OAuth connection provides any of that.
   */
  verifiedGeoConnected?: boolean;
}) {
  const [state, formAction] = useActionState<MediaKitState, FormData>(
    saveMediaKit,
    { error: null, savedPlatform: null },
  );
  const [open, setOpen] = useState(!kit);

  const saved = state.savedPlatform === platform && !state.error;

  if (locked) {
    return (
      <GlassPanel className="p-5 opacity-60">
        <h2 className="text-sm font-semibold text-fg">
          {PLATFORM_LABELS[platform]}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-fg/40">
          {lockReason}
        </p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg">
          {PLATFORM_LABELS[platform]}
        </h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="text-xs text-fg/45 transition hover:text-fg/80"
        >
          {open ? "Close" : kit ? "Edit" : "Add"}
        </button>
      </div>

      {!open ? null : (
        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="platform" value={platform} />

          <Field
            id={`${platform}-handle`}
            name="platform_handle"
            label="Handle"
            defaultValue={kit?.platform_handle ?? ""}
            placeholder="@yourchannel"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={`${platform}-views`}
              name="avg_views"
              type="number"
              min={0}
              label="Average views"
              defaultValue={kit?.avg_views ?? ""}
            />
            <Field
              id={`${platform}-ccv`}
              name="avg_ccv"
              type="number"
              min={0}
              label="Average CCV"
              hint="Live concurrent viewers, if you stream."
              defaultValue={kit?.avg_ccv ?? ""}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={`${platform}-engagement`}
              name="engagement_rate"
              type="number"
              step="0.01"
              min={0}
              max={100}
              label="Engagement %"
              hint="Likes + comments ÷ views."
              defaultValue={kit?.engagement_rate ?? ""}
            />
            <Field
              id={`${platform}-category`}
              name="content_category"
              label="Category"
              placeholder="gaming, tech, beauty…"
              defaultValue={kit?.content_category ?? ""}
            />
          </div>

          <Field
            id={`${platform}-language`}
            name="content_language"
            label="Language"
            placeholder="Arabic, English…"
            defaultValue={kit?.content_language ?? ""}
          />

          {verifiedGeoConnected ? (
            <div className="rounded-xl border border-brand-green/20 bg-brand-green/5 p-3">
              <p className="text-xs leading-relaxed text-brand-green">
                Audience geography is verified via your connected account —
                see below. Disconnect above to enter it manually again.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label
                htmlFor={`${platform}-countries`}
                className="block text-xs font-medium tracking-wide text-fg/70 uppercase"
              >
                Where your audience is
              </label>
              <textarea
                id={`${platform}-countries`}
                name="declared_top_countries"
                rows={4}
                defaultValue={formatCountryShares(
                  kit?.declared_top_countries as CountryShare[] | null,
                )}
                placeholder={"EG 40\nSA 25\nAE 15"}
                className="w-full resize-y rounded-xl border border-fg/10 bg-fg/5 px-3.5 py-2.5 font-mono text-sm text-fg placeholder:text-fg/25 transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none"
              />
              <p className="text-xs text-fg/45">
                One country per line: two-letter code, then a percentage.
                This is recorded as self-reported until you connect platform
                analytics.
              </p>
            </div>
          )}

          {state.error ? <Alert>{state.error}</Alert> : null}
          {saved ? <Alert tone="info">Saved.</Alert> : null}

          <SaveButton label={kit ? "Save changes" : "Add platform"} />
        </form>
      )}
    </GlassPanel>
  );
}

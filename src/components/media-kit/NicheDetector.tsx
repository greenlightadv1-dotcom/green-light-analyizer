"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { detectNiche, type DetectNicheState } from "@/lib/media-kit/actions";

function DetectButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-fg/10 bg-fg/5 px-3 py-1.5 text-xs text-fg/70 transition hover:bg-fg/10 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Detecting…" : "Detect niche"}
    </button>
  );
}

/**
 * AI niche/category detection, shared between YoutubeSyncPanel and
 * InstagramSyncPanel — same action (media-kit/actions.ts's detectNiche),
 * same UI, only the media kit ID differs.
 */
export function NicheDetector({
  mediaKitId,
  currentCategory,
  currentTags,
}: {
  mediaKitId: string;
  currentCategory: string | null;
  currentTags: string[] | null;
}) {
  const [state, formAction] = useActionState<DetectNicheState, FormData>(
    detectNiche,
    { error: null, result: null },
  );

  return (
    <div className="rounded-xl border border-fg/10 bg-fg/5 p-3.5">
      <p className="text-xs font-medium tracking-wide text-fg/70 uppercase">
        Niche & tags
      </p>

      {currentCategory ? (
        <div className="mt-2">
          <p className="text-sm text-fg">{currentCategory}</p>
          {currentTags?.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {currentTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-fg/10 bg-fg/5 px-1.5 py-0.5 text-[10px] text-fg/50"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-fg/40">Not detected yet.</p>
      )}

      <form action={formAction} className="mt-3">
        <input type="hidden" name="media_kit_id" value={mediaKitId} />
        <DetectButton />
      </form>

      {state.error ? (
        <div className="mt-2.5">
          <Alert>{state.error}</Alert>
        </div>
      ) : null}
      {state.result ? (
        <p className="mt-2.5 text-xs text-brand-green">
          Detected: {state.result.category}
        </p>
      ) : null}

      <p className="mt-2.5 text-[11px] leading-relaxed text-fg/30">
        AI-generated from your recent titles/captions — overwrites the
        category above, and never stores the raw text this reads.
      </p>
    </div>
  );
}

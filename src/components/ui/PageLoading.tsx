"use client";

import { useTranslation } from "@/components/LocaleProvider";
import { GlassPanel } from "./GlassPanel";
import { LoadingRegion, Skeleton, SkeletonText } from "./Skeleton";

/**
 * Route-level loading state (used by loading.tsx). Its blocks roughly match
 * each page's real layout, so content arriving does not make the page jump.
 * Announced once as "Loading…" for screen readers.
 */
export function PageLoading({ variant = "list" }: { variant?: "list" | "grid" | "split" }) {
  const { t } = useTranslation();
  return (
    <LoadingRegion label={t("ui.loading")}>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-56 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {variant === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <GlassPanel key={i} className="space-y-3 p-5">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-4 w-2/3" />
              <SkeletonText lines={2} />
            </GlassPanel>
          ))}
        </div>
      ) : variant === "split" ? (
        <div className="grid gap-4 lg:grid-cols-5">
          <GlassPanel className="space-y-4 p-6 lg:col-span-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-11 w-40" />
          </GlassPanel>
          <GlassPanel className="space-y-3 p-6 lg:col-span-2">
            <Skeleton className="h-4 w-1/2" />
            <SkeletonText lines={4} />
          </GlassPanel>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <GlassPanel className="space-y-2 p-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-16" />
            </GlassPanel>
            <GlassPanel className="space-y-2 p-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-32" />
            </GlassPanel>
          </div>
          <GlassPanel className="divide-y divide-line">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-4">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </GlassPanel>
        </div>
      )}
    </LoadingRegion>
  );
}

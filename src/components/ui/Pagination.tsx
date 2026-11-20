"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";
import { paginationItems } from "@/lib/ui/pagination";

/**
 * Page links for a server-paginated list. Links (not buttons), so every page
 * has a real URL and works without JavaScript. `query` holds the other
 * search params to keep; `param` names the page parameter. Previous/next
 * arrows are mirrored in RTL by the logical layout, and the labels name the
 * page for screen readers.
 */
export function Pagination({
  page,
  totalPages,
  basePath,
  query = {},
  param = "page",
}: {
  page: number;
  totalPages: number;
  basePath: string;
  query?: Record<string, string | undefined>;
  param?: string;
}) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v) sp.set(k, v);
    if (p > 1) sp.set(param, String(p));
    else sp.delete(param);
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const base =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-chip px-2.5 text-sm transition focus-visible:focus-ring";
  const idle = `${base} border border-line bg-surface-muted text-fg hover:bg-surface-hover`;
  const off = `${base} border border-line text-fg-subtle`;

  return (
    <nav aria-label={t("ui.pagination.label")} className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-fg-muted">{t("ui.pagination.pageOf", { page, total: totalPages })}</p>
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          {page > 1 ? (
            <Link href={href(page - 1)} className={idle} rel="prev">
              {t("ui.pagination.previous")}
            </Link>
          ) : (
            <span className={off} aria-disabled="true">{t("ui.pagination.previous")}</span>
          )}
        </li>
        {paginationItems(page, totalPages).map((item, i) =>
          item === "gap" ? (
            <li key={`gap-${i}`} aria-hidden className="px-1 text-fg-subtle">…</li>
          ) : (
            <li key={item}>
              <Link
                href={href(item)}
                aria-current={item === page ? "page" : undefined}
                aria-label={t("ui.pagination.page", { page: item })}
                className={item === page ? `${base} bg-brand-green font-semibold text-ink` : idle}
              >
                {item}
              </Link>
            </li>
          ),
        )}
        <li>
          {page < totalPages ? (
            <Link href={href(page + 1)} className={idle} rel="next">
              {t("ui.pagination.next")}
            </Link>
          ) : (
            <span className={off} aria-disabled="true">{t("ui.pagination.next")}</span>
          )}
        </li>
      </ul>
    </nav>
  );
}

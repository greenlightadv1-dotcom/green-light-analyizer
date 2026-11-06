import type { ReactNode } from "react";

export type Column<Row> = {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Logical alignment, so it mirrors in RTL. */
  align?: "start" | "end";
  className?: string;
};

/**
 * A data table that scrolls sideways inside its own box on narrow screens
 * instead of pushing the page wider. Headers are real <th scope="col">, the
 * caption names the table for screen readers (visually hidden by default),
 * and an empty table shows `empty` instead of a bare header row.
 */
export function Table<Row>({
  caption,
  captionVisible = false,
  columns,
  rows,
  rowKey,
  empty,
}: {
  caption: string;
  captionVisible?: boolean;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  empty: ReactNode;
}) {
  const align = (a?: "start" | "end") => (a === "end" ? "text-end" : "text-start");
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className={captionVisible ? "px-5 pt-4 text-start text-sm font-semibold text-fg" : "sr-only"}>
          {caption}
        </caption>
        <thead className="border-b border-line text-xs text-fg-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-5 py-3 font-medium ${align(c.align)}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.length ? (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-5 py-3 align-top ${align(c.align)} ${c.className ?? ""}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-5 py-8 text-center text-sm text-fg-muted">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

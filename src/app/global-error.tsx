"use client";

/**
 * Last-resort boundary: catches errors thrown by the root layout itself,
 * which `error.tsx` cannot — it sits inside that layout.
 *
 * Because this file *replaces* the root layout, it renders its own <html> and
 * <body> and gets none of what that layout provides: no LocaleProvider (so no
 * translation — this is the one screen in the product that is English only,
 * and deliberately so), no ThemeProvider (so no `.dark` class to key off), and
 * no guarantee the app stylesheet resolved, since a failing root layout is
 * exactly what would prevent it.
 *
 * So the styles here are inline and self-contained, with the brand hexes
 * written out literally (CLAUDE.md §2.1) rather than read from the `@theme`
 * tokens that may not have loaded. `prefers-color-scheme` stands in for the
 * theme the provider would otherwise have set.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 16px",
          background: "#f6f7fb",
          color: "#231f20",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <style>{`
          @media (prefers-color-scheme: dark) {
            body { background: #0a0d14 !important; color: #ffffff !important; }
            .ge-card { background: rgba(41,62,97,.35) !important; border-color: rgba(255,255,255,.08) !important; }
            .ge-body { color: rgba(255,255,255,.55) !important; }
            .ge-ref { color: rgba(255,255,255,.35) !important; }
          }
          .ge-retry:hover { filter: brightness(1.1); }
          .ge-retry:focus-visible { outline: 2px solid #62e823; outline-offset: 2px; }
          @media (prefers-reduced-motion: reduce) { .ge-retry { transition: none !important; } }
        `}</style>

        <div style={{ width: "100%", maxWidth: "28rem" }}>
          <div
            className="ge-card"
            style={{
              background: "rgba(255,255,255,.68)",
              border: "1px solid rgba(41,62,97,.12)",
              borderRadius: 20,
              padding: 32,
            }}
          >
            <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, letterSpacing: "-.01em" }}>
              Green Light hit an unexpected error
            </h1>
            <p
              className="ge-body"
              style={{ margin: "12px 0 0", fontSize: ".875rem", lineHeight: 1.6, color: "rgba(35,31,32,.6)" }}
            >
              The page could not be loaded at all. Trying again often clears it.
              If it keeps happening, quote the reference below to support.
            </p>

            {error.digest ? (
              <p
                className="ge-ref"
                style={{
                  margin: "16px 0 0",
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: ".75rem",
                  wordBreak: "break-all",
                  color: "rgba(35,31,32,.45)",
                }}
              >
                Reference: {error.digest}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => retry()}
              className="ge-retry"
              style={{
                marginTop: 24,
                height: 44,
                padding: "0 20px",
                border: "none",
                borderRadius: 12,
                background: "#62e823",
                color: "#231f20",
                fontSize: ".875rem",
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
                transition: "filter .15s ease",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

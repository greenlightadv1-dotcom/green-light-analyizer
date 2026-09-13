import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * Everything third-party this product talks to — Resend, NVIDIA, the Google
 * and Meta APIs, WHOIS, Safe Browsing — is called from the server, where CSP
 * does not apply. The browser only ever talks to this origin and to Supabase
 * (auth and realtime), which is what `connect-src` below reflects.
 */

// Supabase is reached directly from the browser with the anon key. The
// wildcard covers the hosted project; the env-derived origin is appended so a
// self-hosted or custom-domain deployment keeps working. Evaluated when the
// config is loaded, so a changed URL needs a redeploy — the same rule that
// already applies to every other server env var in this project.
function supabaseOrigins(): string[] {
  const origins = ["https://*.supabase.co", "wss://*.supabase.co"];
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (configured) {
    try {
      const { origin, host } = new URL(configured);
      if (!host.endsWith(".supabase.co")) {
        origins.push(origin, `wss://${host}`);
      }
    } catch {
      // A malformed URL is already fatal elsewhere; don't fail the build here.
    }
  }
  return origins;
}

/**
 * `script-src` carries 'unsafe-inline' because Next.js streams its RSC payload
 * through inline scripts, and this app adds two more of its own (the theme and
 * locale no-flash scripts, which must run before first paint). Locking that
 * down means per-request nonces threaded through proxy.ts — worth doing, but
 * it touches auth-critical routing, so it is a deliberate follow-up rather
 * than something to slip in alongside a header change.
 *
 * `img-src` allows any https host because a creator's avatar is an arbitrary
 * URL they supply. There is no allowlist that could cover it.
 *
 * The directives that still do real work regardless: frame-ancestors stops
 * clickjacking, form-action stops an injected form posting credentials
 * off-origin, connect-src stops exfiltration to an attacker's endpoint, and
 * base-uri stops a base-tag rewrite of every relative URL on the page.
 */
function contentSecurityPolicy(): string {
  const connect = ["'self'", ...supabaseOrigins()].join(" ");

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          // No `preload`: that ships the domain to a browser-baked list which
          // is slow and painful to reverse. Add it once the domain is settled.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Redundant with frame-ancestors for modern browsers, kept for old ones.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nothing in this product uses these; deny them rather than inherit
          // whatever a future embedded script decides to ask for.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

export default nextConfig;

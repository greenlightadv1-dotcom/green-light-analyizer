import "server-only";

import type { OAuthPlatform } from "@/lib/types/database";

/**
 * Whether each connector's OAuth app is actually registered on this
 * environment — used to tell "connect this" apart from "this is still
 * waiting on platform review".
 *
 * Server-only on purpose: these are secrets, and a copy of this bundled into
 * client code would read undefined and quietly report every platform
 * unconfigured.
 */
export function oauthConfigured(): Record<OAuthPlatform, boolean> {
  const appUrl = Boolean(process.env.NEXT_PUBLIC_APP_URL);

  return {
    youtube: Boolean(
      process.env.GOOGLE_OAUTH_CLIENT_ID &&
        process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
        appUrl,
    ),
    instagram: Boolean(
      process.env.META_APP_ID && process.env.META_APP_SECRET && appUrl,
    ),
  };
}

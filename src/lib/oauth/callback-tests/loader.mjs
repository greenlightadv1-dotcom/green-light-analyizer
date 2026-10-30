/**
 * Node module hooks for callback.test.ts — test-only, never bundled.
 *
 * Loads the *real* OAuth callback route (and the real youtube.ts, instagram.ts,
 * youtube-scopes.ts, platforms.ts and logger behind it) with native type
 * stripping, swapping only the boundaries that need a Next.js request scope or
 * a database for the in-memory fakes in fakes.mjs: "server-only", the session
 * (`@/lib/auth`), the service-role client, the signed state, and the token
 * store. Google itself is a stubbed global fetch in the test — no network.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FAKES = new URL("./fakes.mjs", import.meta.url).href;
const SRC = fileURLToPath(new URL("../../../", import.meta.url));
const FAKED_SPECIFIERS = new Set(["server-only", "@/lib/auth", "@/lib/supabase/admin", "@/lib/oauth/state"]);
// Faked by resolved file, since youtube.ts reaches it as "./tokens".
const FAKED_FILES = new Set([path.join(SRC, "lib/oauth/tokens.ts")]);

export async function resolve(specifier, context, next) {
  if (FAKED_SPECIFIERS.has(specifier)) return { url: FAKES, shortCircuit: true };
  // next has no "exports" map, so ESM needs the file name the bundler infers.
  if (specifier === "next/server") return next("next/server.js", context);

  let base = null;
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
  else if (
    specifier.startsWith(".") &&
    context.parentURL?.startsWith("file:") &&
    !/\.(m?[jt]s|json)$/.test(specifier)
  ) {
    base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }

  if (base) {
    for (const candidate of [base, `${base}.ts`, path.join(base, "index.ts")]) {
      if (candidate.endsWith(".ts") && existsSync(candidate)) {
        if (FAKED_FILES.has(candidate)) return { url: FAKES, shortCircuit: true };
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }
  return next(specifier, context);
}

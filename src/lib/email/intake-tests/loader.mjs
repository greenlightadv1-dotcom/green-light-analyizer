/**
 * Node module hooks for intake.test.ts — test-only, never bundled.
 *
 * intake.ts is a Next.js server module: it imports "server-only" (which throws
 * outside a React Server Components build), uses the "@/…" path alias and
 * extensionless relative imports, and reaches Supabase, the AI engine, the
 * security check and WhatsApp. These hooks let Node load the *real* intake.ts
 * with native type stripping, swapping only those five boundaries for the
 * in-memory fakes in fakes.mjs. Everything else — parse, claim, received
 * (bypassed through deps.fetchContent), budget, mask, the spam screener, the
 * logger — is the production code.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FAKES = new URL("./fakes.mjs", import.meta.url).href;
const SRC = fileURLToPath(new URL("../../../", import.meta.url));
const FAKED = new Set([
  "server-only",
  "@/lib/supabase/admin",
  "@/lib/ai/evaluate",
  "@/lib/security/check",
  "@/lib/whatsapp",
]);

export async function resolve(specifier, context, next) {
  if (FAKED.has(specifier)) return { url: FAKES, shortCircuit: true };

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
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }
  return next(specifier, context);
}

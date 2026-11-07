import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { isPreviewBlockedRequest, previewWritesBlocked } from "./preview-guard.ts";

const preview = { VERCEL_ENV: "preview" };

test("only a Vercel preview is read-only, and the opt-in lifts it", () => {
  assert.equal(previewWritesBlocked(preview), true);
  assert.equal(previewWritesBlocked({ VERCEL_ENV: "production" }), false);
  assert.equal(previewWritesBlocked({ VERCEL_ENV: "development" }), false);
  assert.equal(previewWritesBlocked({}), false);
  assert.equal(previewWritesBlocked({ ...preview, PREVIEW_WRITES_ENABLED: "1" }), false);
  assert.equal(previewWritesBlocked({ ...preview, PREVIEW_WRITES_ENABLED: "true" }), true, "only the exact opt-in value lifts it");
});

test("a preview refuses every state-changing method, including server actions and sign-in", () => {
  for (const m of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
    for (const p of ["/login", "/get-started", "/apply", "/activate", "/api/applications/documents", "/inbox/x", "/admin/users"]) {
      assert.equal(isPreviewBlockedRequest(m, p, preview), true, `${m} ${p}`);
    }
  }
});

test("a preview refuses the GET routes that write, and serves ordinary pages", () => {
  for (const p of ["/api/oauth/youtube/callback", "/apply/continue", "/api/cron/relay-retry", "/api/cron/news-refresh", "/api/webhooks/resend"]) {
    assert.equal(isPreviewBlockedRequest("GET", p, preview), true, p);
  }
  for (const p of ["/", "/login", "/get-started", "/p/someone", "/privacy", "/dashboard", "/api/oauth/youtube/start"]) {
    assert.equal(isPreviewBlockedRequest("GET", p, preview), false, p);
  }
});

test("production and local are never blocked", () => {
  for (const env of [{ VERCEL_ENV: "production" }, {}]) {
    assert.equal(isPreviewBlockedRequest("POST", "/login", env), false);
    assert.equal(isPreviewBlockedRequest("GET", "/api/oauth/youtube/callback", env), false);
  }
});

test("the guard is wired into the proxy, every cron check and both webhooks", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  assert.match(read("../proxy.ts"), /isPreviewBlockedRequest\(request\.method, request\.nextUrl\.pathname\)/);
  assert.match(read("./cron-auth.ts"), /if \(previewWritesBlocked\(\)\) return false;/);
  for (const hook of ["../app/api/webhooks/resend/route.ts", "../app/api/webhooks/supabase/route.ts"]) {
    const src = read(hook);
    const post = src.slice(src.indexOf("export async function POST"));
    assert.match(post.slice(0, 300), /if \(previewWritesBlocked\(\)\) return NextResponse\.json/, hook);
  }
});

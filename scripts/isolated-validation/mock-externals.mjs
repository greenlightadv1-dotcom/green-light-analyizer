// Test-only preload: no email, webhook or third-party call leaves this machine.
// Requests to external integration hosts are answered locally and recorded in
// OUTBOX (one JSON line each). Supabase on 127.0.0.1 passes through untouched.
import { appendFileSync } from "node:fs";
const OUTBOX = process.env.MOCK_OUTBOX;
const realFetch = globalThis.fetch;
const MOCKED = ["api.resend.com", "graph.facebook.com", "discord.com", "integrate.api.nvidia.com", "oauth2.googleapis.com", "www.googleapis.com", "youtubeanalytics.googleapis.com", "safebrowsing.googleapis.com"];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
  if (MOCKED.includes(url.hostname)) {
    let body = init.body;
    try { body = JSON.parse(body); } catch {}
    appendFileSync(OUTBOX, JSON.stringify({ at: new Date().toISOString(), host: url.hostname, path: url.pathname, idempotencyKey: Boolean(new Headers(init.headers || {}).get("idempotency-key")), body }) + "\n");
    if (url.hostname === "api.resend.com") return new Response(JSON.stringify({ id: "mock-" + Date.now() }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ error: "mocked" }), { status: 503, headers: { "content-type": "application/json" } });
  }
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    appendFileSync(OUTBOX, JSON.stringify({ at: new Date().toISOString(), host: url.hostname, path: url.pathname, blocked: true }) + "\n");
    return new Response("blocked by test harness", { status: 503 });
  }
  return realFetch(input, init);
};

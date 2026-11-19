// Test-only preload: no email, webhook or third-party call leaves this machine.
// Requests to external integration hosts are answered locally and recorded in
// OUTBOX (one JSON line each). Supabase on 127.0.0.1 passes through untouched.
//
// NVIDIA: by default it answers 503 (the AI is "down"). With MOCK_NVIDIA set
// to a file path, the file's first word picks a scripted behaviour per call:
//   ok         a valid G reply (en, or ar when the MESSAGE is Arabic) that
//              quotes the previous user turn from HISTORY, one action, one
//              proposal; no figures, so it passes grounding
//   invalid    a body that is not JSON
//   incomplete JSON without the required "reply"
//   ungrounded a reply stating a figure G was never given
//   hostile    actions and proposals pointing at ids outside the caller's scope
//   500 | 429  that HTTP status
//   slow       never answers; honours the request's abort signal
import { appendFileSync, readFileSync } from "node:fs";
const OUTBOX = process.env.MOCK_OUTBOX;
const realFetch = globalThis.fetch;
const MOCKED = ["api.resend.com", "graph.facebook.com", "discord.com", "integrate.api.nvidia.com", "oauth2.googleapis.com", "www.googleapis.com", "youtubeanalytics.googleapis.com", "safebrowsing.googleapis.com"];
const FOREIGN = "99999999-9999-4999-8999-999999999999";

function nvidiaMode() {
  try {
    return readFileSync(process.env.MOCK_NVIDIA, "utf8").trim().split(/\s+/)[0] || "down";
  } catch {
    return "down";
  }
}

function block(prompt, name) {
  const m = prompt.match(new RegExp(`<<<${name}\\n([\\s\\S]*?)\\n?${name}>>>`));
  return m ? m[1].trim() : "";
}

function completion(content, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status, headers: { "content-type": "application/json" } });
}

async function nvidia(body, signal) {
  const mode = nvidiaMode();
  const prompt = body?.messages?.[0]?.content ?? "";
  if (mode === "down") return new Response(JSON.stringify({ error: "mocked" }), { status: 503, headers: { "content-type": "application/json" } });
  if (mode === "500" || mode === "429") return new Response(JSON.stringify({ error: mode }), { status: Number(mode), headers: { "content-type": "application/json", ...(mode === "429" ? { "retry-after": "1" } : {}) } });
  if (mode === "slow") {
    return new Promise((_, reject) => {
      const err = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      if (signal?.aborted) return err();
      signal?.addEventListener("abort", err);
    });
  }
  if (mode === "invalid") return completion("I think your channel is doing great!");
  if (mode === "incomplete") return completion(JSON.stringify({ actions: [] }));
  if (mode === "ungrounded") return completion(JSON.stringify({ reply: "Your channel grew 937% last month and is worth $48,250.", actions: [], proposals: [] }));
  const message = block(prompt, "MESSAGE");
  const history = block(prompt, "HISTORY");
  const arabic = /[؀-ۿ]/.test(message);
  const company = prompt.includes("speaking with a company");
  const lastUser = (history.match(/^user: (.*)$/gm) ?? []).pop()?.replace(/^user: /, "") ?? "";
  if (mode === "hostile") {
    return completion(JSON.stringify({
      reply: arabic ? "إليك ما وجدته." : "Here is what I found.",
      actions: [{ action: "open_deal", param: FOREIGN }, { action: "open_admin" }, { action: "open_dashboard" }],
      proposals: company
        ? [{ type: "invitation", brief_id: FOREIGN, creator_id: FOREIGN, message: "Join us" }, { type: "content_draft", kind: "idea", title: "Not for companies", body: "Should be dropped" }]
        : [{ type: "message_draft", collaboration_id: FOREIGN, text: "Hello" }, { type: "brief_draft", title: "Not for creators", description: "Should be dropped entirely" }],
    }));
  }
  const reply = arabic
    ? `رد تجريبي من G.${lastUser ? ` سؤالك السابق كان: «${lastUser}».` : ""} توصية: راجع ملفك الإعلامي.`
    : `Mock G reply.${lastUser ? ` Your previous question was: "${lastUser}".` : ""} Recommendation: review your media kit.`;
  return completion(JSON.stringify({
    reply,
    actions: [{ action: company ? "open_discover" : "open_media_kit" }],
    proposals: company
      ? []
      : [{ type: "content_draft", kind: "hook", title: arabic ? "خطاف تجريبي" : "Mock hook", body: arabic ? "الفكرة: تجربة.\nالمصدر: لا يوجد مصدر." : "Concept: a test hook.\nSource: no source." }],
  }));
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
  if (MOCKED.includes(url.hostname)) {
    let body = init.body;
    try { body = JSON.parse(body); } catch {}
    appendFileSync(OUTBOX, JSON.stringify({ at: new Date().toISOString(), host: url.hostname, path: url.pathname, idempotencyKey: Boolean(new Headers(init.headers || {}).get("idempotency-key")), ...(url.hostname === "integrate.api.nvidia.com" ? { mode: nvidiaMode() } : { body }) }) + "\n");
    if (url.hostname === "api.resend.com") return new Response(JSON.stringify({ id: "mock-" + Date.now() }), { status: 200, headers: { "content-type": "application/json" } });
    if (url.hostname === "integrate.api.nvidia.com") return nvidia(body, init.signal);
    return new Response(JSON.stringify({ error: "mocked" }), { status: 503, headers: { "content-type": "application/json" } });
  }
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    appendFileSync(OUTBOX, JSON.stringify({ at: new Date().toISOString(), host: url.hostname, path: url.pathname, blocked: true }) + "\n");
    return new Response("blocked by test harness", { status: 503 });
  }
  return realFetch(input, init);
};

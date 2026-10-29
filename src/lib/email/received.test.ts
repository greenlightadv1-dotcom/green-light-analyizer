import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  MAX_RECEIVED_BYTES,
  RECEIVED_EMAIL_ENDPOINT,
  fetchReceivedEmail,
  validateReceivedEmail,
} from "./received.ts";
import { EMAIL_ID, receivedEmail } from "./fixtures/resend.ts";

/** §5.3: fetching the body Resend's webhook does not carry. No network. */

const KEY = "re_test_fixture_key";
const noSleep = async () => {};

type Call = { url: string; init: RequestInit };

/** A fetch stub that answers from a script of responses, recording calls. */
function scripted(...steps: (Response | Error)[]) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    return step.clone();
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const opts = (impl: typeof fetch) => ({ apiKey: KEY, fetchImpl: impl, sleep: noSleep });

test("retrieves the documented received-email response", async () => {
  const { impl, calls } = scripted(json(receivedEmail()));
  const result = await fetchReceivedEmail(EMAIL_ID, opts(impl));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.attempts, 1);
  assert.equal(result.email.id, EMAIL_ID);
  assert.match(String(result.email.html), /\$1,500/);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${RECEIVED_EMAIL_ENDPOINT}/${EMAIL_ID}`);
  assert.equal(calls[0].init.method, "GET");
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, `Bearer ${KEY}`);
  assert.equal(calls[0].init.cache, "no-store");
  assert.ok(calls[0].init.signal, "every attempt carries an abort signal");
});

test("an id that is not a Resend id never reaches the URL", async () => {
  for (const bad of ["", "../emails", "a/b", "x?y=1", "id with space", "a".repeat(101)]) {
    const { impl, calls } = scripted(json(receivedEmail()));
    const result = await fetchReceivedEmail(bad, opts(impl));
    assert.equal(result.ok, false, bad);
    if (result.ok) continue;
    assert.equal(result.retryable, false);
    assert.equal(calls.length, 0, `no request for ${JSON.stringify(bad)}`);
  }
});

test("a missing API key is retryable and makes no request", async () => {
  const { impl, calls } = scripted(json(receivedEmail()));
  const result = await fetchReceivedEmail(EMAIL_ID, { apiKey: "", fetchImpl: impl, sleep: noSleep });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.retryable, true);
  assert.match(result.reason, /RESEND_API_KEY/);
  assert.equal(calls.length, 0);
});

test("404 is permanent and is not retried", async () => {
  const { impl, calls } = scripted(json({ message: "not found" }, 404));
  const result = await fetchReceivedEmail(EMAIL_ID, opts(impl));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.retryable, false);
  assert.equal(result.status, 404);
  assert.equal(calls.length, 1);
});

test("a 5xx is retried, and a later success is returned", async () => {
  const { impl, calls } = scripted(json({}, 503), json(receivedEmail()));
  const result = await fetchReceivedEmail(EMAIL_ID, opts(impl));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.attempts, 2);
  assert.equal(calls.length, 2);
});

test("attempts are bounded; persistent 429 stays retryable for the provider", async () => {
  const { impl, calls } = scripted(json({}, 429));
  const result = await fetchReceivedEmail(EMAIL_ID, opts(impl));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.retryable, true);
  assert.equal(result.reason, "HTTP 429");
  assert.equal(result.attempts, 2);
  assert.equal(calls.length, 2, "default is two attempts, never more");
});

test("401/403 are retryable: an operator can fix the key", async () => {
  for (const status of [401, 403]) {
    const { impl } = scripted(json({}, status));
    const result = await fetchReceivedEmail(EMAIL_ID, opts(impl));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.retryable, true, String(status));
  }
});

test("network errors and timeouts are retryable", async () => {
  const { impl } = scripted(new TypeError("fetch failed"));
  const network = await fetchReceivedEmail(EMAIL_ID, opts(impl));
  assert.equal(network.ok, false);
  if (!network.ok) {
    assert.equal(network.retryable, true);
    assert.equal(network.reason, "network error");
  }

  // A fetch that only settles when aborted: the timeout must abort it.
  const hanging = ((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        reject(e);
      });
    })) as unknown as typeof fetch;
  const started = Date.now();
  const timedOut = await fetchReceivedEmail(EMAIL_ID, {
    apiKey: KEY,
    fetchImpl: hanging,
    sleep: noSleep,
    timeoutMs: 20,
  });
  assert.ok(Date.now() - started < 2000, "the timeout bounds the call");
  assert.equal(timedOut.ok, false);
  if (!timedOut.ok) {
    assert.equal(timedOut.retryable, true);
    assert.match(timedOut.reason, /timed out/);
    assert.equal(timedOut.attempts, 2);
  }
});

test("a 2xx that is not JSON is retryable; JSON of the wrong shape is not", async () => {
  const { impl: html } = scripted(new Response("<html>gateway</html>", { status: 200 }));
  const notJson = await fetchReceivedEmail(EMAIL_ID, opts(html));
  assert.equal(notJson.ok, false);
  if (!notJson.ok) {
    assert.equal(notJson.retryable, true);
    assert.equal(notJson.reason, "response was not JSON");
  }

  for (const body of [
    [receivedEmail()],
    receivedEmail({ id: "another-email-id" }),
    receivedEmail({ object: "list" }),
    receivedEmail({ text: 42 }),
    receivedEmail({ html: { evil: true } }),
    null,
    "a string",
  ]) {
    const { impl, calls } = scripted(json(body));
    const result = await fetchReceivedEmail(EMAIL_ID, opts(impl));
    assert.equal(result.ok, false, JSON.stringify(body)?.slice(0, 40));
    if (!result.ok) {
      assert.equal(result.retryable, false);
      assert.equal(result.reason, "malformed response");
    }
    assert.equal(calls.length, 1, "a malformed answer is not retried");
  }
});

test("an oversized response is refused", async () => {
  const big = JSON.stringify(receivedEmail({ html: "x".repeat(MAX_RECEIVED_BYTES) }));
  const { impl } = scripted(new Response(big, { status: 200 }));
  const result = await fetchReceivedEmail(EMAIL_ID, opts(impl));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, false);
    assert.equal(result.reason, "response too large");
  }
});

test("failure results never echo the provider body or the API key", async () => {
  const leaky = "offer body: call 01012345678 — secret context";
  for (const step of [new Response(leaky, { status: 500 }), new Response(leaky, { status: 400 })]) {
    const { impl } = scripted(step);
    const result = await fetchReceivedEmail(EMAIL_ID, opts(impl));
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes("01012345678"), serialized);
    assert.ok(!serialized.includes(KEY), serialized);
  }
});

test("validateReceivedEmail accepts the fixture and tolerates absent fields", () => {
  assert.ok(validateReceivedEmail(receivedEmail(), EMAIL_ID));
  assert.ok(validateReceivedEmail({ text: "only text" }, EMAIL_ID));
  assert.ok(validateReceivedEmail(receivedEmail({ html: null, text: null }), EMAIL_ID));
});

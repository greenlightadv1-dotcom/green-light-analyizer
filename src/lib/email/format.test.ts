import { strict as assert } from "node:assert";
import { test } from "node:test";

import { escapeHtml, relaySubject } from "./format.ts";

/** §6 outbound relay formatting. */

test("escapes markup so a reply cannot inject into the company's mail client", () => {
  const hostile = `<img src=x onerror="alert(1)">`;
  const escaped = escapeHtml(hostile);
  assert.ok(!escaped.includes("<img"), "tag survived");
  assert.ok(!escaped.includes(">"), "bracket survived");
  assert.match(escaped, /&lt;img/);
});

test("escapes the ampersand first so entities are not double-escaped", () => {
  // "&lt;" typed literally must survive as text, not become a real "<".
  assert.equal(escapeHtml("&lt;"), "&amp;lt;");
  assert.equal(escapeHtml("Tom & Jerry"), "Tom &amp; Jerry");
});

test("escapes both quote styles — attribute breakouts use either", () => {
  assert.equal(escapeHtml(`"x"`), "&quot;x&quot;");
  assert.equal(escapeHtml("'x'"), "&#39;x&#39;");
});

test("leaves ordinary text alone", () => {
  const plain = "Happy to do it for $1,200. When do you need it?";
  assert.equal(escapeHtml(plain), plain);
});

test("the subject leaks no creator identity", () => {
  const subject = relaySubject("44444444-4444-4444-4444-444444444444");
  assert.match(subject, /sponsorship enquiry/);
  assert.ok(!subject.includes("@"), "no address in the subject");
});

test("the subject is stable so a mail client threads the conversation", () => {
  const id = "44444444-4444-4444-4444-444444444444";
  assert.equal(relaySubject(id), relaySubject(id));
});

test("different deals get different subjects", () => {
  assert.notEqual(
    relaySubject("44444444-4444-4444-4444-444444444444"),
    relaySubject("55555555-5555-5555-5555-555555555555"),
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { activationWhatsAppText, approvedWhatsAppText, whatsappDigits } from "./whatsapp.ts";

test("whatsappDigits keeps international digits only", () => {
  assert.equal(whatsappDigits("+201012345678"), "201012345678");
  assert.equal(whatsappDigits("00201012345678"), "201012345678");
  assert.equal(whatsappDigits("+20 101 234-5678"), "201012345678");
  assert.equal(whatsappDigits("(+971) 50 123 4567"), "971501234567");
  assert.equal(whatsappDigits("+971501234567"), "971501234567");
});

test("whatsappDigits refuses anything that is not a phone number", () => {
  for (const bad of [undefined, null, 42, "", "abc", "+0123456789", "1234567", "1234567890123456", "+20 10x2345678"]) {
    assert.equal(whatsappDigits(bad), null, String(bad));
  }
});

test("the activation message carries the link in both languages and no password", () => {
  const link = "https://www.greenlightadvs.com/activate?token=abc";
  const text = activationWhatsAppText(link, 48);
  assert.equal(text.split(link).length - 1, 2);
  assert.match(text, /48/);
  assert.doesNotMatch(text, /password:/i);
});

test("the approval message points at the sign-in page and carries no secret", () => {
  const text = approvedWhatsAppText("https://www.greenlightadvs.com/login");
  assert.match(text, /\/login/);
  assert.doesNotMatch(text, /token=|password:/i);
});

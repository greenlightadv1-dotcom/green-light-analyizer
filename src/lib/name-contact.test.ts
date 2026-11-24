import { test } from "node:test";
import assert from "node:assert/strict";
import { nameHasContact } from "./name-contact.ts";

test("ordinary names pass, in any script", () => {
  for (const n of ["Ayman Mansour", "محمد زياد", "Acme Brand 2026", "MOHAMED ZEYAD CO FOUNDER", "Studio 7"]) {
    assert.equal(nameHasContact(n), false, n);
  }
});

test("names carrying contact details are refused", () => {
  for (const n of ["Ayman ayman@gmail.com", "Ayman 01012345678", "أيمن ٠١٠١٢٣٤٥٦٧٨", "Ayman wa.me/2010", "Call me on WhatsApp", "Acme www.acme.com", "Acme https://x.co", "Ayman @handle", "Ayman 010 123 4567"]) {
    assert.equal(nameHasContact(n), true, n);
  }
});

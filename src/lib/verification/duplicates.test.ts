import { strict as assert } from "node:assert";
import { test } from "node:test";
import { duplicateKeys } from "./duplicates.ts";

test("duplicate signals use identifying values only", () => {
  assert.deepEqual(duplicateKeys("creator_kyc", { legal_name: "Layla", date_of_birth: "1998-01-01", phone: "+201012345678", handle: "@l" }), [
    { label: "phone", match: { phone: "+201012345678" } },
    { label: "name_dob", match: { legal_name: "Layla", date_of_birth: "1998-01-01" } },
  ]);
  // A name alone is never a signal.
  assert.deepEqual(duplicateKeys("creator_kyc", { legal_name: "Layla" }), []);
  assert.deepEqual(duplicateKeys("company_kyb", { registration_number: "123", tax_number: "9", contact_phone: "+2010" }).map((k) => k.label), ["phone", "registration_number", "tax_number"]);
  assert.deepEqual(duplicateKeys("representative", { phone: "+201" }), [{ label: "phone", match: { phone: "+201" } }]);
});

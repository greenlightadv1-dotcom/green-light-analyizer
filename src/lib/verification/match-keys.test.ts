import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { STRONG_SIGNALS, fingerprint, maskIdNumber, matchInputs, normalizeIdentifier, normalizeName, normalizePhone, prepareIdNumberWith } from "./match-keys.ts";

const KEY = Buffer.alloc(32, 7);

test("phones normalise to one international form", () => {
  for (const v of ["+20 101 234 5678", "00201012345678", "01012345678", "٠١٠١٢٣٤٥٦٧٨", "+20-101-234-5678"]) assert.equal(normalizePhone(v), "201012345678", v);
  assert.equal(normalizePhone("123"), null);
});

test("names compare loosely but never by name alone", () => {
  assert.equal(normalizeName("Layla  HASSAN"), normalizeName("layla hassan"));
  assert.equal(normalizeName("Léa Dubois"), normalizeName("Lea Dubois"));
  assert.equal(normalizeName("أحمد عليّ"), normalizeName("احمد علي"));
  assert.equal(normalizeName("فاطمة"), normalizeName("فاطمه"));
  assert.notEqual(normalizeName("Hassan Layla"), normalizeName("Layla Hassan"), "word order matters");
  // A name without a date of birth is never a signal.
  assert.deepEqual(matchInputs("creator_kyc", { legal_name: "Layla Hassan" }), []);
  assert.deepEqual(matchInputs("creator_kyc", { legal_name: "Layla Hassan", date_of_birth: "1998-02-03" }).map((m) => m.signal), ["name_dob"]);
});

test("identifiers ignore separators and digit scripts; company numbers carry the country", () => {
  assert.equal(normalizeIdentifier("298-0101 1234567"), "29801011234567");
  assert.equal(normalizeIdentifier("٢٩٨٠١٠١١٢٣٤٥٦٧"), "29801011234567");
  assert.equal(normalizeIdentifier("a12"), null);
  const eg = matchInputs("company_kyb", { country: "EG", registration_number: "12 345", tax_number: "999-888", contact_phone: "+201012345678" });
  assert.deepEqual(eg.map((m) => [m.signal, m.value]), [["phone", "201012345678"], ["registration_number", "EG:12345"], ["tax_number", "EG:999888"]]);
  // The same number registered in another country is a different company.
  const sa = matchInputs("company_kyb", { country: "SA", registration_number: "12345" });
  assert.notEqual(sa[0].value, eg[1].value);
  // Without a country, no company signal is produced at all (avoids cross-country false positives).
  assert.deepEqual(matchInputs("company_kyb", { registration_number: "12345" }), []);
});

test("fingerprints are keyed, deterministic and separated by signal; phones are weak", () => {
  const a = fingerprint(KEY, "id_number", "29801011234567");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, fingerprint(KEY, "id_number", "29801011234567"));
  assert.notEqual(a, fingerprint(Buffer.alloc(32, 8), "id_number", "29801011234567"), "another key gives another fingerprint");
  assert.notEqual(a, fingerprint(KEY, "registration_number", "29801011234567"));
  assert.ok(!a.includes("29801011234567"));
  assert.ok(!STRONG_SIGNALS.includes("phone"));
});

test("the ID number is fingerprinted and masked before saving; its plaintext never passes through", () => {
  const seen: string[] = [];
  const fp = (n: string) => (seen.push(n), fingerprint(KEY, "id_number", n));
  const r = prepareIdNumberWith("creator_kyc", { legal_name: "Layla", id_number: " 2980-1011234567 " }, fp);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.raw.id_number, maskIdNumber("29801011234567"));
    assert.equal(r.raw.id_number, "••••67");
    assert.ok(!JSON.stringify(r.raw).includes("1011234"));
    assert.match(r.idFingerprint ?? "", /^[0-9a-f]{64}$/);
  }
  assert.deepEqual(seen, ["29801011234567"]);
  // The masked hint coming back unchanged keeps what is stored.
  const keep = prepareIdNumberWith("creator_kyc", { id_number: "••••67", phone: "x" }, fp);
  assert.ok(keep.ok && !("id_number" in keep.raw) && keep.idFingerprint === null);
  assert.deepEqual(prepareIdNumberWith("representative", { id_number: "!!" }, fp), { ok: false, field: "id_number" });
  // Company KYB has no ID number field: nothing changes.
  const co = prepareIdNumberWith("company_kyb", { registered_name: "N" }, fp);
  assert.ok(co.ok && co.idFingerprint === null);
});

test("every save path fingerprints the ID number, and the server refuses a flagger's approval early", () => {
  const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  for (const p of ["app/apply/actions.ts", "app/verification/actions.ts"]) {
    const s = src(p);
    assert.match(s, /prepareIdNumber\(/, p);
    assert.ok(s.indexOf("prepareIdNumber(") < s.indexOf("mergeDetails("), `${p}: fingerprint before merge`);
    assert.match(s, /writeMatchKeys\(/, p);
  }
  const actions = src("app/(app)/admin/verification/actions.ts");
  assert.match(actions, /rpc\("verification_enhanced_review_state"/);
  assert.match(actions, /raised_by\.includes\(admin\.id\)\) return fail\("verification\.errors\.second_reviewer_required"\)/);
  // The pre-check runs before the internal note or the transition is written.
  assert.ok(actions.indexOf("second_reviewer_required") < actions.indexOf('rpc("verification_transition"'));
  // Fingerprints are never sent to the browser: the reviewer page shows only which signal matched.
  const page = src("app/(app)/admin/verification/[id]/page.tsx");
  assert.doesNotMatch(page, /verification_match_keys|\.fingerprint\b/);
  const server = src("lib/verification/match-keys-server.ts");
  assert.match(server, /out\.push\(\{ signal: k\.signal as MatchSignal, strong: [^}]*cases: cases \?\? \[\] \}\)/, "matches carry no fingerprint");
});

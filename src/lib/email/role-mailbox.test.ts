import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildForward, forwardTarget, roleMailboxIn } from "./role-mailbox.ts";

test("role mailboxes are recognised only on the root domain", () => {
  assert.equal(roleMailboxIn(["Support@GreenLightAdvs.com"]), "support");
  assert.equal(roleMailboxIn(["someone@gmail.com", "privacy@greenlightadvs.com"]), "privacy");
  assert.equal(roleMailboxIn(["support@analyze.greenlightadvs.com"]), null, "aliases live on the inbound subdomain");
  assert.equal(roleMailboxIn(["support@greenlightadvs.com.evil.example"]), null);
  assert.equal(roleMailboxIn(["random@greenlightadvs.com"]), null);
});

test("the forward target must be a real address and never a role mailbox", () => {
  assert.equal(forwardTarget("ops@example.com"), "ops@example.com");
  assert.equal(forwardTarget(""), null);
  assert.equal(forwardTarget(undefined), null);
  assert.equal(forwardTarget("not an email"), null);
  assert.equal(forwardTarget("support@greenlightadvs.com"), null, "would loop");
});

test("the forward keeps the sender as Reply-To and names the mailbox", () => {
  const f = buildForward({ role: "security", from: "a@b.example", fromName: "A", subject: "Bug", text: "Details", attachmentNames: ["x.pdf"] });
  assert.equal(f.subject, "[security] Bug");
  assert.equal(f.replyTo, "a@b.example");
  assert.match(f.text, /Received at security@greenlightadvs\.com/);
  assert.match(f.text, /Attachments .*x\.pdf/);
  assert.match(f.text, /Details$/);
});

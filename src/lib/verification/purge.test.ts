import { test } from "node:test";
import assert from "node:assert/strict";
import { runPurge, type PurgeDeps } from "./purge.ts";

type Doc = { id: string; path: string; due: boolean; marked: boolean; confirmed: boolean };

function fake(docs: Doc[], failRemove = new Set<string>(), failConfirm = new Set<string>()) {
  const files = new Set(docs.map((d) => d.path));
  const failures: [string, string][] = [];
  const deps: PurgeDeps = {
    async pending() {
      return docs.filter((d) => d.marked && !d.confirmed).map((d) => ({ id: d.id, path: d.path }));
    },
    async candidates() {
      return docs.filter((d) => !d.marked).map((d) => d.id);
    },
    async mark(id) {
      const d = docs.find((x) => x.id === id)!;
      if (!d.due) return { skip: "not_due" };
      d.marked = true;
      return { path: d.path };
    },
    async remove(path) {
      if (failRemove.has(path)) return { ok: false, code: "storage_error" };
      files.delete(path); // idempotent: a missing file is not an error
      return { ok: true };
    },
    async confirm(id) {
      if (failConfirm.has(id)) return false;
      docs.find((x) => x.id === id)!.confirmed = true;
      return true;
    },
    async failed(id, code) {
      failures.push([id, code]);
    },
  };
  return { deps, files, failures };
}

test("deletes only what the database marked as due, and confirms each deletion", async () => {
  const docs: Doc[] = [
    { id: "old", path: "c/old.jpg", due: true, marked: false, confirmed: false },
    { id: "new", path: "c/new.jpg", due: false, marked: false, confirmed: false },
  ];
  const { deps, files } = fake(docs);
  const r = await runPurge(deps);
  assert.deepEqual(r, { retried: 0, marked: 1, deleted: 1, failed: 0, skipped: 1 });
  assert.deepEqual([...files], ["c/new.jpg"]);
  assert.ok(docs[0].confirmed && !docs[1].marked);
});

test("a failed deletion is recorded and retried on the next run, never lost", async () => {
  const docs: Doc[] = [{ id: "a", path: "c/a.pdf", due: true, marked: false, confirmed: false }];
  const failing = new Set(["c/a.pdf"]);
  const { deps, files, failures } = fake(docs, failing);
  const first = await runPurge(deps);
  assert.deepEqual(first, { retried: 0, marked: 1, deleted: 0, failed: 1, skipped: 0 });
  assert.deepEqual(failures, [["a", "storage_error"]]);
  assert.ok(files.has("c/a.pdf") && docs[0].marked && !docs[0].confirmed);
  failing.clear();
  const second = await runPurge(deps);
  assert.deepEqual(second, { retried: 1, marked: 0, deleted: 1, failed: 0, skipped: 0 });
  assert.ok(!files.has("c/a.pdf") && docs[0].confirmed);
  assert.deepEqual(await runPurge(deps), { retried: 0, marked: 0, deleted: 0, failed: 0, skipped: 0 });
});

test("a deletion that succeeded but was not confirmed is confirmed next time (idempotent delete)", async () => {
  const docs: Doc[] = [{ id: "b", path: "c/b.png", due: true, marked: false, confirmed: false }];
  const failConfirm = new Set(["b"]);
  const { deps, files } = fake(docs, new Set(), failConfirm);
  assert.equal((await runPurge(deps)).failed, 1);
  assert.ok(!files.has("c/b.png") && !docs[0].confirmed);
  failConfirm.clear();
  assert.equal((await runPurge(deps)).deleted, 1);
  assert.ok(docs[0].confirmed);
});

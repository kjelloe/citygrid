// A room survives a restart (X1, plan.md §3.5).
//
// `server/store.js` had no test at all when it was written, which is the shape
// this project keeps finding: a module whose only reader is the module that
// constructs it. What matters here is not that JSON round-trips — it is the two
// properties the server leans on:
//
//   - a write that dies halfway leaves the PREVIOUS save whole, because the
//     bytes go to a temporary file and are renamed over it;
//   - `keepForDays` actually removes something, because it is the option the X0
//     review promised would leave `test/omissions.test.js`'s unread list.
//
// The clock is injected rather than waited for: a test that sleeps for a day is
// not a test.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile, utimes, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../server/store.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const scratch = () => mkdtemp(join(tmpdir(), "citygrid-rooms-"));

test("a room written is a room read back", async () => {
  const dir = await scratch();
  const store = createStore({ dir });
  await store.put("alpha", { save: { v: 3, tick: 48, note: "a city" }, tick: 48 });
  const back = await store.get("alpha");
  assert.equal(back.id, "alpha");
  assert.equal(back.tick, 48);
  assert.deepEqual(back.save, { v: 3, tick: 48, note: "a city" });
  assert.ok(back.savedAt > 0, "a save with no timestamp cannot be pruned");
});

test("a room nobody saved is nothing, not a crash", async () => {
  const dir = await scratch();
  const store = createStore({ dir });
  assert.equal(await store.get("never-hosted"), undefined);
});

test("the write is atomic: no half-written save, and no .tmp left behind", async () => {
  const dir = await scratch();
  const store = createStore({ dir });
  await store.put("beta", { save: { tick: 1 }, tick: 1 });
  await store.put("beta", { save: { tick: 2 }, tick: 2 });
  const names = await readdir(dir);
  assert.deepEqual(names, ["beta.json"], `a temporary file survived: ${names.join(", ")}`);
  // The second write replaced the first whole, rather than merging into it.
  assert.equal(JSON.parse(await readFile(join(dir, "beta.json"), "utf8")).tick, 2);
});

test("two saves of one room do not race each other", async () => {
  // `put` is not awaited by the pump (plan.md §3.7.8: a write the beat waits
  // for is a late beat), so several can be in flight. The last one must win,
  // and none of them may leave the file half written.
  const dir = await scratch();
  const store = createStore({ dir });
  for (let tick = 1; tick <= 20; tick += 1) store.put("gamma", { save: { tick }, tick });
  await store.settled();
  assert.equal((await store.get("gamma")).tick, 20);
  assert.deepEqual(await readdir(dir), ["gamma.json"]);
});

test("keepForDays removes the rooms nobody has touched, and only those", async () => {
  const dir = await scratch();
  const store = createStore({ dir, keepForDays: 30 });
  await store.put("fresh", { save: {}, tick: 0 });
  await store.put("stale", { save: {}, tick: 0 });
  // Backdated on disk rather than waited for.
  const old = new Date(Date.now() - 40 * DAY_MS);
  await utimes(join(dir, "stale.json"), old, old);
  // Something that is not a save at all is left alone.
  await writeFile(join(dir, "notes.txt"), "not a room");

  const removed = await store.prune();
  assert.deepEqual(removed, ["stale"], `pruned ${removed.join(", ") || "nothing"}`);
  assert.ok(await stat(join(dir, "fresh.json")), "a room being played was removed");
  assert.deepEqual((await readdir(dir)).sort(), ["fresh.json", "notes.txt"]);
});

test("pruning a directory that does not exist is nothing, not a crash", async () => {
  const store = createStore({ dir: join(await scratch(), "never-made") });
  assert.deepEqual(await store.prune(), []);
});

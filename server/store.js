// A room survives a restart (X1, plan.md §3.5).
//
// Descends from `../CarrierDominion/server/save.js`: write to a temporary file
// and rename it, so a process that dies mid-write leaves the previous save
// intact rather than half of a new one. Rewritten against this game — that one
// saves a war in progress, this one saves a city plus the commands since the
// last checkpoint, because a city is a deterministic function of its command
// stream and a checkpoint plus a log is smaller and more honest than a
// checkpoint alone.
//
// **Off the pump** (plan.md §3.7.8). Autosave-sized writes land as late beats in
// Fireline's host probe, so nothing here is awaited by `server/pump.js`: a save
// is started and the beat goes on.

import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;

export function createStore({ dir = "rooms", keepForDays = 30 } = {}) {
  let writing = Promise.resolve();

  const path = (id) => join(dir, `${id}.json`);

  /** The city and the commands since it, written atomically. Returns the
   * promise for a caller that wants to wait (a test, a shutdown); the pump
   * never does. */
  function put(id, { save, log = [], tick = 0 }) {
    const body = JSON.stringify({ id, tick, savedAt: Date.now(), save, log });
    writing = writing.then(async () => {
      await mkdir(dir, { recursive: true });
      const temporary = `${path(id)}.tmp`;
      await writeFile(temporary, body);
      await rename(temporary, path(id));
    }).catch((error) => {
      // A room that cannot be saved is still a room being played: say so and
      // keep going, which is what a disk full at 3 a.m. looks like.
      console.error(`room ${id} could not be saved:`, error.message ?? error);
    });
    return writing;
  }

  async function get(id) {
    try {
      return JSON.parse(await readFile(path(id), "utf8"));
    } catch {
      return undefined;
    }
  }

  /** Rooms nobody has touched for `keepForDays`. The option has existed in
   * `engine/options.js` since Wave 0 and nothing read it until now — it was one
   * of the thirteen `test/omissions.test.js` pins (A124). */
  async function prune(now = Date.now()) {
    const removed = [];
    let names = [];
    try { names = await readdir(dir); } catch { return removed; }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const file = join(dir, name);
      const info = await stat(file).catch(() => undefined);
      if (!info) continue;
      if (now - info.mtimeMs <= keepForDays * DAY_MS) continue;
      await unlink(file).catch(() => {});
      removed.push(name.replace(/\.json$/, ""));
    }
    return removed;
  }

  return { put, get, prune, settled: () => writing };
}

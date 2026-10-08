// `data/` into the engine, server side (X1c).
//
// `client/content.js` does this for the page: `engine/` may not do I/O, so the
// balance, the catalogue and the quests are read outside it and handed in, and
// the mirrors in `engine/rules.js` and `engine/catalogue.js` are the FALLBACK.
//
// **The server had no such adapter**, and `engine/quests.js` has no mirror at
// all — `CATALOGUE = []` until somebody calls `setQuests`. So a room ran on the
// engine's own numbers with no quests in it while every browser ran on the
// files, and because quest progress is HASHED STATE the two could not agree
// about the city. `tools/room_soak.mjs` could not see it: its scripted clients
// are in the server's own process and share its mirrors. `tools/room_smoke.mjs`
// saw it on the first run, with three different hashes at one tick.
//
// This is W2's defect in a second place. The worker was fixed by handing it the
// page's content (`a second thread needs the data the first one loaded`); a
// room is one more process, and the fix is the same shape.

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setRules } from "../engine/rules.js";
import { setCatalogue } from "../engine/catalogue.js";
import { setQuests, validateQuests } from "../engine/quests.js";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

const read = async (...parts) => JSON.parse(await readFile(join(dataDir, ...parts), "utf8"));

/**
 * The ruleset, the catalogue and the quests, from `data/` into the engine.
 *
 * Failure is **fatal here**, unlike in the page. A browser that cannot fetch
 * `data/` is a player offline and the mirror is a city it can prove; a server
 * that cannot read its own files is a room that would hand every client a city
 * built from different numbers, and the handshake cannot see it — the build
 * hash is of the files, not of what was read.
 */
export async function loadServerContent() {
  const rules = await read("balance.json");
  const catalogue = await read("buildings.json");
  delete rules.note;
  delete catalogue.note;
  setRules(rules);
  setCatalogue(catalogue);

  const index = await read("quests", "index.json");
  const quests = [];
  for (const file of index) for (const quest of await read("quests", file)) quests.push(quest);
  const problems = validateQuests(quests);
  if (problems.length > 0) {
    throw new Error(`the quest catalogue has ${problems.length} problem(s): ${problems.join("; ")}`);
  }
  setQuests(quests);
  return { rules, catalogue, quests };
}

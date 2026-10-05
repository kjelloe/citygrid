// Loading data/ into the engine.
//
// `engine/` may not do I/O (ruling: the engine is pure), so somebody outside it
// has to read the JSON and hand it in. That somebody is here for the browser,
// and `test/helpers` for node.
//
// The quest catalogue is VALIDATED on the way in. A quest that references a
// measure nobody implements would otherwise sit in the catalogue for months,
// never firing, looking exactly like a quest whose conditions have not been met
// — the most expensive kind of bug, because it looks like content.

import { setQuests, validateQuests } from "../engine/quests.js";
import { setRules } from "../engine/rules.js";
import { setCatalogue } from "../engine/catalogue.js";
import { setConfig } from "./world/config.js";

/**
 * The ruleset and the building catalogue, from `data/` into the engine.
 *
 * `setRules` and `setCatalogue` had no caller for the life of the project
 * (P90): `engine/rules.js` and `engine/catalogue.js` carry a MIRROR of their
 * JSON so that `engine/` can stay free of I/O, and the mirror was the only
 * thing that ever ran. Nothing was wrong — `test/rules.test.js` and
 * `test/utilities.test.js` refuse to let the two drift — but the file a
 * CLAUDE.md rule calls the home of every number was decoration at runtime, and
 * editing it changed nothing in the game.
 *
 * Failure is not fatal and must not be: the mirror IS the fallback, and it is
 * byte-identical by test. A city that boots offline with a stale cache runs on
 * numbers it can prove rather than on nothing.
 */
export async function loadRuleset(base = "./data/") {
  const problems = [];
  // **Three files, not two** (M8). `cityviewer.json` was the renderer's half of
  // the same defect P90 found in the engine's: the file is where CLAUDE.md says
  // every number lives, `client/world/config.js` carries a mirror of it, a drift
  // test keeps the two identical — and nothing ever read the file, so S15's
  // first two colour moves edited it and changed nothing on screen.
  for (const [file, apply, key] of [
    ["balance.json", setRules, "rules"],
    ["buildings.json", setCatalogue, "catalogue"],
    ["cityviewer.json", setConfig, "cityviewer"],
  ]) {
    try {
      const loaded = await (await fetch(`${base}${file}`)).json();
      delete loaded.note;
      apply(loaded);
      content[key] = loaded;
    } catch (error) {
      problems.push(`${file}: ${error.message ?? error}`);
    }
  }
  for (const problem of problems) console.error(`ruleset: ${problem} — running on the mirror`);
  return { problems };
}

/**
 * What was loaded, so the SIMULATION can be given the same numbers (W2).
 *
 * The worker does no I/O and has no import map; it is handed this in its init
 * message instead. That is not a convenience — a worker that fetched the files
 * itself could be running a different balance from the page beside it, and the
 * first evidence would be a desync. `worker_smoke` found exactly that: the two
 * arms diverged by 5,300 in the treasury because one had read `data/` and the
 * other was on `engine/rules.js`'s mirror, with no quests at all.
 */
const content = { rules: undefined, catalogue: undefined, quests: undefined };
export function loadedContent() { return content; }

export async function loadQuests(base = "./data/quests/") {
  const index = await (await fetch(`${base}index.json`)).json();
  const all = [];
  for (const file of index) {
    const list = await (await fetch(`${base}${file}`)).json();
    for (const quest of list) all.push(quest);
  }
  const problems = validateQuests(all);
  if (problems.length > 0) {
    // Loudly, at boot. A broken quest is a startup error, not a silent no-op at
    // hour three.
    console.error(`quest catalogue has ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  ${problem}`);
  }
  setQuests(all);
  content.quests = all;
  return { quests: all, problems };
}

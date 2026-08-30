// The fixture runner: replay a recorded command sequence and check every hash.
//
// This is the project's tripwire, and it was never built. Slice 0.4 has been
// marked done since Wave 0 with "`test/fixtures/empty.json` passes" as its
// gate, `CLAUDE.md` describes a two-file ritual around the fixtures, and
// `test/fixtures/` was an empty directory for the life of the project (the P22
// audit). Four slices added hashed state with nothing watching.
//
// A fixture is a JSON file:
//
//   {
//     "name": "...", "why": "...", "era": 1, "savedAt": "...",
//     "options": { ...defaultOptions overrides... },
//     "systems": ["development", "utilities", ...],
//     "steps": [
//       { "command": {...}, "result": "ok", "hash": "…", "events": ["built"] }
//     ]
//   }
//
// **Every step pins the hash after it**, not just the end. A single end-state
// hash tells you the run diverged; a hash per step tells you where.
//
// Events are pinned as SORTED UNIQUE KINDS, not counts. The kinds are the
// contract — "this command produced a `built` and nothing else" — while the
// count of `budget` events in a tick is an implementation detail that would
// make the fixture brittle without making it stricter.

import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateWorld } from "../engine/worldgen.js";
import { createState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { rules } from "../engine/rules.js";

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = join(here, "..", "test", "fixtures");

/** Every system a fixture may switch on, by the name it uses in `systems`.
 *
 * Explicit rather than "import everything": a fixture that does not name
 * `disasters` must not have disasters running through it, or a change to
 * disaster tuning would move a fixture that is about roads. */
const SYSTEMS = {
  build: () => import("../engine/build-commands.js"),
  development: () => import("../engine/development.js"),
  utilities: () => import("../engine/utilities.js"),
  economy: () => import("../engine/economy.js"),
  civic: () => import("../engine/civic.js"),
  fire: () => import("../engine/fire.js"),
  disasters: () => import("../engine/disasters.js"),
  traffic: () => import("../engine/traffic.js"),
  quests: () => import("../engine/quests.js"),
  history: () => import("../engine/history.js"),
};

/** Registration is global and permanent — `register()` writes into a module
 * table — so a system switched on by one fixture stays on for the next one in
 * the same process. Loading them all once, up front, is the only honest
 * option; `systems` then documents what a fixture MEANT to exercise, and the
 * suite runs every fixture in one process with one set of systems.
 *
 * This is a real limitation and it is written down rather than hidden: a
 * fixture cannot currently pin behaviour with a system switched off. */
export async function loadSystems() {
  for (const load of Object.values(SYSTEMS)) await load();
}

export function fixtureState(fixture) {
  const options = defaultOptions(fixture.options ?? {});
  if (fixture.generate === false) return createState(options);
  const world = generateWorld(options);
  if (!world.ok) throw new Error(`fixture ${fixture.name}: generation failed — ${world.reason}`);
  return world.state;
}

function kindsOf(outcome) {
  return [...new Set((outcome.events ?? []).map((e) => e.kind))].sort();
}

/**
 * Replays a fixture.
 *
 * @param record when true, fills in `result`, `hash` and `events` instead of
 *   comparing them. That is what `tools/repin.mjs` uses; nothing else should.
 * @returns `{ ok, problems, steps }` — `problems` names the FIRST failing step
 *   and every one after it, because a hash that moved at step 3 makes every
 *   later hash meaningless and reporting forty failures hides the one.
 */
export function replay(fixture, { record = false } = {}) {
  const state = fixtureState(fixture);
  const problems = [];
  const steps = [];

  for (let i = 0; i < fixture.steps.length; i += 1) {
    const step = fixture.steps[i];
    const repeat = step.repeat ?? 1;
    let outcome;
    const kinds = new Set();
    for (let n = 0; n < repeat; n += 1) {
      outcome = apply(state, { ...step.command });
      for (const kind of kindsOf(outcome)) kinds.add(kind);
    }
    const hash = hashState(state);
    const events = [...kinds].sort();
    const observed = { result: outcome.result, hash, events };
    steps.push(observed);

    if (record) {
      step.result = observed.result;
      step.hash = observed.hash;
      step.events = observed.events;
      continue;
    }

    const at = `${fixture.name} step ${i} (${step.command.type}${repeat > 1 ? ` ×${repeat}` : ""})`;
    if (step.result !== undefined && step.result !== observed.result) {
      problems.push(`${at}: result ${observed.result}, pinned ${step.result}`);
    }
    if (step.events !== undefined) {
      const pinned = [...step.events].sort();
      if (pinned.join(",") !== events.join(",")) {
        // Event drift inside a pinned window means the reducer is wrong, not
        // the fixture (CLAUDE.md). Named separately from a hash mismatch
        // because the two have different answers.
        problems.push(`${at}: EVENT DRIFT — events [${events}], pinned [${pinned}]`);
      }
    }
    if (step.hash !== undefined && step.hash !== hash) {
      problems.push(`${at}: hash ${hash}, pinned ${step.hash}`);
      // Everything after a moved hash is noise.
      break;
    }
  }

  // "Check the fixture before you measure it" (the slice-workflow skill). A
  // fixture that pins the hashes of a city that never grew pins nothing, and
  // looks exactly like one that works — the founding fixture's first draft had
  // its wire eight rows from its zoning and hashed forty steps of an empty
  // field quite happily.
  //
  // Skipped once a hash has already failed: the replay stopped there, so the
  // state is half-built and "population is 12" would be a second complaint
  // about the first problem.
  if (!record && fixture.expect && problems.length === 0) {
    for (const [path, atLeast] of Object.entries(fixture.expect)) {
      const value = path.split(".").reduce((o, k) => (o === undefined ? o : o[k]), state);
      const actual = typeof value === "number" ? value : (value?.length ?? 0);
      if (actual < atLeast) {
        problems.push(`${fixture.name}: ${path} is ${actual}, and the fixture is only worth measuring at ${atLeast} or more`);
      }
    }
  }

  return { ok: problems.length === 0, problems, steps, state, era: rules().era };
}

export async function readFixture(name) {
  const text = await readFile(join(FIXTURE_DIR, name), "utf8");
  return JSON.parse(text);
}

export async function fixtureNames() {
  const files = await readdir(FIXTURE_DIR);
  return files.filter((f) => f.endsWith(".json")).sort();
}

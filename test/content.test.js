// Loading data/ into the engine (P90).
//
// `engine/` may not do I/O, so `engine/rules.js` and `engine/catalogue.js` each
// carry a MIRROR of their JSON and an adapter is supposed to hand the real file
// in at boot. For the life of the project nothing called either setter: the
// game ran on the mirror, and `data/balance.json` — the file a CLAUDE.md rule
// calls the home of every number — changed nothing when edited.
//
// Nothing was WRONG, because two tests refuse to let the mirror drift. That is
// exactly why it survived: the defect's whole symptom was a file nobody could
// make a difference with.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { loadRuleset } from "../client/content.js";
import { rules, setRules } from "../engine/rules.js";
import { catalogue, setCatalogue, definitionIds } from "../engine/catalogue.js";

const read = (name) => JSON.parse(readFileSync(join(repoRoot, "data", name), "utf8"));

/** The mirrors, before anything in this file touches them. Both setters are
 * module-global, so a test that loads a doctored ruleset and leaves it there
 * would hand the next test in this process a different game. */
const MIRROR = { rules: rules(), catalogue: catalogue() };
const restore = () => { setRules(MIRROR.rules); setCatalogue(MIRROR.catalogue); };

/** `fetch` as the loader uses it, over a map of path → object. */
function serving(files) {
  return (url) => {
    const name = String(url).split("/").pop();
    if (!Object.hasOwn(files, name)) return Promise.reject(new Error(`404 ${name}`));
    return Promise.resolve({ json: () => Promise.resolve(files[name]) });
  };
}

test("the loader puts the FILE into the engine, not the mirror", async () => {
  const balance = read("balance.json");
  const buildings = read("buildings.json");
  // Doctored, so that "it loaded" and "it was already identical" are different
  // answers. The mirror is byte-identical to the file by test, which is what
  // made the missing call invisible for the life of the project.
  const doctored = { ...balance, build: { ...balance.build, road: 999 } };
  const extra = { ...buildings, pylon: { category: "power", w: 1, h: 1, cost: 1, upkeep: 0,
    power: 1, water: 0, pollution: 0, fireRisk: 0, unlock: 0 } };

  globalThis.fetch = serving({ "balance.json": doctored, "buildings.json": extra });
  try {
    const { problems } = await loadRuleset("./data/");
    assert.deepEqual(problems, []);
    assert.equal(rules().build.road, 999, "the ruleset still reads the mirror");
    assert.ok(definitionIds().includes("pylon"), "the catalogue still reads the mirror");
    // And the note is not a rule or a building: `definitionIds()` is sorted and
    // indexed by `civicVariant`, so a stray key shifts every civic pool.
    assert.equal(definitionIds().includes("note"), false);
    assert.equal(rules().note, undefined);
  } finally {
    restore();
    delete globalThis.fetch;
  }
});

test("a ruleset that will not load leaves the mirror standing", async () => {
  // The mirror IS the fallback and the fallback has to be silent-safe: a city
  // booting offline from a stale cache runs on numbers it can prove.
  const before = rules().build.road;
  globalThis.fetch = serving({});
  try {
    const { problems } = await loadRuleset("./data/");
    assert.equal(problems.length, 2, `${problems.length} problem(s): ${problems.join(", ")}`);
    assert.equal(rules().build.road, before, "a failed load changed the ruleset");
    assert.ok(definitionIds().includes("coalPlant"));
  } finally {
    restore();
    delete globalThis.fetch;
  }
});

test("the real files load, and agree with the mirror they replace", async () => {
  // The two drift tests compare the mirror against the JSON; this one asserts
  // the LOADER's result is the same game, which is the half that would break if
  // the loader ever transformed what it read.
  globalThis.fetch = serving({ "balance.json": read("balance.json"), "buildings.json": read("buildings.json") });
  try {
    await loadRuleset("./data/");
    assert.deepEqual(rules(), MIRROR.rules);
    assert.deepEqual(catalogue(), MIRROR.catalogue);
  } finally {
    restore();
    delete globalThis.fetch;
  }
});

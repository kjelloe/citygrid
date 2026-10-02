// engine/rules.js mirrors data/balance.json because engine/ may not do I/O.
// The mirror is duplication, and this test is what refuses to let it drift.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot, docExists, jsFilesIn } from "./helpers/sources.js";
import { rules, buildCost, difficultyOf } from "../engine/rules.js";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";

const balance = JSON.parse(readFileSync(join(repoRoot, "data", "balance.json"), "utf8"));

test("the engine's mirror matches data/balance.json exactly", () => {
  const mirror = rules();
  for (const section of Object.keys(balance)) {
    if (section === "note") continue;
    assert.deepEqual(mirror[section], balance[section], `${section} has drifted from the JSON`);
  }
});

/**
 * Numbers in the ruleset that NOTHING reads, each with the reason it is still
 * in the file. The same shape `test/utilities.test.js` uses for the catalogue's
 * dead fields (Q119) and `test/i18n.test.js` uses for untranslated strings: an
 * allow-list where every entry says why, never a way to make the test green.
 *
 * Found by P90's round, which ran the checklist's third direction — "data the
 * engine mirrors and nothing reads" — per LEAF for the first time rather than
 * per block. It found 21. Three whole blocks went: `power` and `water` were the
 * catalogue's own production figures written down a second time (and `water`
 * was the name that silently replaced the harbour's block in T4a), and
 * `milestones` was a population ladder the quests have done since slice 4.3.
 */
const UNREAD_RULES = {
  "tax.responseMonths": "how many months a tax change takes to be felt. `taxDrag` applies "
    + "the table's value the same month, with no lag term anywhere.",
  "demand.birthRatePerMille": "the reference's population model. `computeDemand` grows "
    + "population out of housing capacity and occupancy, not out of a birth rate.",
  "demand.labourBaseMax": "the reference's labour ceiling; nothing caps jobs that way.",
  "demand.internalMarketDivisor": "the reference's internal-market term, which this "
    + "demand model has no equivalent of.",
  "service.maxRoadEffect": "a cap on what road coverage can contribute; `coveragePass` "
    + "has no road term at all.",
  "service.maxPoliceEffect": "a cap on the police term, which is already bounded by the "
    + "coverage field's own 0-255.",
  "service.maxFireEffect": "the same, for fire.",
  // The three that are not merely vestigial — they describe rules a player would
  // feel. Filed as Q124 rather than implemented, because each one moves every
  // sweep number in the project and wants an era of its own.
  "development.decayOneIn": "Q124. Growth rolls `growthOneIn`; decay has no roll, so a "
    + "lot below the decay threshold decays EVERY month while a lot above the growth "
    + "threshold grows one month in three.",
  "development.roadWeight": "Q124. `scoreLot` weighs demand and land value; road access "
    + "is a boolean gate rather than a weighted term.",
  "development.crowdingWeight": "Q124. `scoreLot` has no crowding term.",
};

test("every number in the ruleset is read by something", () => {
  // A leaf is READ if its name appears, as a whole word and outside a comment,
  // anywhere in engine/, client/ or shared/. Deliberately lenient about HOW:
  // `buildCost` indexes `build` by `kind + "OverWater"`, `upkeep` by a
  // definition id and `deputy.roadReach` by a doctrine name, so a scan that
  // demanded `.leaf` would report four live blocks as dead.
  const source = [...jsFilesIn("engine"), ...jsFilesIn("client"), ...jsFilesIn("shared")]
    .filter((f) => !f.path.endsWith("rules.js"))
    .map((f) => f.source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""))
    .join("\n");
  const dead = [];
  const walk = (value, path) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const key of Object.keys(value)) {
        if (key.startsWith("_") || key === "note" || key === "era") continue;
        walk(value[key], [...path, key]);
      }
      return;
    }
    const leaf = path[path.length - 1];
    if (!new RegExp(`(?<![A-Za-z0-9_])${leaf}(?![A-Za-z0-9_])`).test(source)) dead.push(path.join("."));
  };
  walk(balance, []);

  const unexplained = dead.filter((key) => !Object.hasOwn(UNREAD_RULES, key));
  assert.deepEqual(unexplained, [],
    `ruleset numbers nothing reads, and no entry in UNREAD_RULES: ${unexplained.join(", ")}`);
  for (const key of Object.keys(UNREAD_RULES)) {
    assert.ok(dead.includes(key), `${key} is read now — take it off UNREAD_RULES`);
  }
});

test("every balance era has a sweep report that justifies it", () => {
  // Ruling 007: inherited constants are a starting point for measurement, never
  // a shipped balance. Era 0 meant "untuned"; anything above it is a claim that
  // somebody measured, and this is what makes that claim checkable.
  //
  // The report is the evidence. An era bumped without one is a number somebody
  // liked the look of.
  assert.ok(Number.isInteger(balance.era) && balance.era >= 0, `era is ${balance.era}`);
  assert.match(balance.note, new RegExp(`ERA ${balance.era}`, "i"),
    "the note must say which era these numbers belong to");
  if (balance.era > 0) {
    assert.ok(docExists(join("reports", `balance-era${balance.era}.md`)),
      `era ${balance.era} has no reports/balance-era${balance.era}.md to justify it`);
    assert.match(balance.note, /sim_sweep/,
      "the note must name the sweep that produced the era");
  }
});

test("every balance number is an integer", () => {
  // Floats in the ruleset would reach the reducer and diverge across engines.
  const walk = (value, path) => {
    if (typeof value === "number") {
      assert.ok(Number.isInteger(value), `${path} is a float: ${value}`);
      return;
    }
    if (Array.isArray(value)) return value.forEach((item, i) => walk(item, `${path}[${i}]`));
    if (value && typeof value === "object") {
      for (const key of Object.keys(value)) walk(value[key], `${path}.${key}`);
    }
  };
  walk(balance, "balance");
});

test("difficulty tiers move in the directions they claim", () => {
  const { relaxed, steady, demanding } = balance.difficulty;
  assert.ok(relaxed.buildCostPercent < steady.buildCostPercent);
  assert.ok(steady.buildCostPercent < demanding.buildCostPercent);
  assert.ok(relaxed.taxYieldPercent > steady.taxYieldPercent);
  assert.ok(steady.taxYieldPercent > demanding.taxYieldPercent);
  assert.ok(relaxed.startingTreasury > demanding.startingTreasury);
  assert.ok(relaxed.disasterOneIn > demanding.disasterOneIn, "harder means disasters more often");
});

test("build costs scale with difficulty", () => {
  const costAt = (difficulty) => {
    const state = createState(defaultOptions({ width: 8, height: 8, difficulty }));
    return buildCost(state, "road");
  };
  assert.ok(costAt("relaxed") < costAt("steady"));
  assert.ok(costAt("steady") < costAt("demanding"));
});

test("an unknown difficulty falls back to steady rather than to nothing", () => {
  const state = createState(defaultOptions({ width: 8, height: 8, difficulty: "impossible" }));
  assert.equal(difficultyOf(state).buildCostPercent, balance.difficulty.steady.buildCostPercent);
});

test("an unknown build key costs nothing rather than NaN", () => {
  const state = createState(defaultOptions({ width: 8, height: 8 }));
  assert.equal(buildCost(state, "teleporter"), 0);
});

test("the tax drag table spans the whole tax range", () => {
  assert.equal(balance.tax.dragTable.length, balance.tax.max - balance.tax.min + 1);
  assert.ok(balance.tax.dragTable[0] > 0, "no tax should encourage growth");
  assert.ok(balance.tax.dragTable[balance.tax.max] < 0, "maximum tax should discourage it");
});

test("the multiplayer thresholds match the ruling", () => {
  assert.equal(balance.multiplayer.derelictYears, 5);
  assert.equal(balance.multiplayer.absenceYears, 5);
  assert.equal(balance.multiplayer.seasonYears, 25);
});

// --- a duplicate key is not an error, which is the problem -------------------

/** Every key token in a JSON text: a string literal followed by a colon.
 *
 * Written out rather than inferred from `JSON.parse`, because `parse` is
 * exactly what cannot see this — a duplicate key keeps the LAST one and says
 * nothing. Tracks string state so a value containing `":` is not a key. */
function keyTokens(text) {
  let count = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch !== '"') { i += 1; continue; }
    // Walk to the end of the string literal, honouring escapes.
    let j = i + 1;
    while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
    let k = j + 1;
    while (k < text.length && /\s/.test(text[k])) k += 1;
    if (text[k] === ":") count += 1;
    i = j + 1;
  }
  return count;
}

/** Every key in a parsed tree, counted the same way. */
function parsedKeys(value) {
  if (Array.isArray(value)) return value.reduce((n, v) => n + parsedKeys(v), 0);
  if (value && typeof value === "object") {
    return Object.keys(value).length + Object.values(value).reduce((n, v) => n + parsedKeys(v), 0);
  }
  return 0;
}

test("no data file has the same key twice", () => {
  // T4a put a `harbour` block in as `water`, which was already the utilities'
  // block. A duplicate JSON key keeps the last one, `engine/rules.js` mirrored
  // the same collision, and the mirror test AGREED because both copies had
  // lost the same thing — so every water pump in the game silently had no
  // capacity and the only symptom was a marina that would not build.
  for (const name of ["balance.json", "buildings.json", "cityviewer.json", "i18n/en.json", "i18n/no.json"]) {
    const text = readFileSync(join(repoRoot, "data", name), "utf8");
    const written = keyTokens(text);
    const kept = parsedKeys(JSON.parse(text));
    assert.equal(written, kept,
      `data/${name} writes ${written} keys and parses ${kept}: ${written - kept} of them are replaced by a later one of the same name`);
  }
});

test("the duplicate-key check can actually see one", () => {
  // Planted, because a check that has never been shown to fire is a comment.
  const doubled = '{ "a": { "x": 1 }, "b": 2, "a": { "y": 3 } }';
  assert.equal(keyTokens(doubled), 5);
  assert.equal(parsedKeys(JSON.parse(doubled)), 3);
  // And a value that looks like a key does not count as one.
  const tricky = '{ "note": "a: b, \\"c\\": d", "n": 1 }';
  assert.equal(keyTokens(tricky), parsedKeys(JSON.parse(tricky)));
});

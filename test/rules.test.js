// engine/rules.js mirrors data/balance.json because engine/ may not do I/O.
// The mirror is duplication, and this test is what refuses to let it drift.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
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

test("balance is labelled era 0 until a sweep says otherwise", () => {
  // Ruling 007: inherited constants are a starting point for measurement,
  // never a shipped balance.
  assert.equal(balance.era, 0);
  assert.match(balance.note, /ERA 0, UNTUNED/);
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

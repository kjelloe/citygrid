// The history buffer and the statistics that read it (slice 4.6).
//
// `plan-v1.md`'s gate: "Every statistic has an explanation string; history
// buffers are bounded and hashed." Both halves are asserted here, and so is the
// third thing that gate does not say out loud — that history reaches all the
// places hashed state has to reach, which is where the last three nested
// records went wrong (see the comment in `engine/save.js`).

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { createState, copyState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { CMD_JOIN, CMD_TICK } from "../engine/commands.js";
import { toSave, fromSave } from "../engine/save.js";
import { HISTORY_CAP, HISTORY_FIELDS } from "../engine/constants.js";
import { historyPass, sampleOf, changeOver } from "../engine/history.js";
import { SERIES, reading, points, statistics, unknownFields, WINDOW } from "../client/ui/statistics-model.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/traffic.js";
import "../engine/history.js";

function blank() {
  const state = createState(defaultOptions({ seed: 5, width: 16, height: 16, seats: 1 }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  return state;
}

// --- bounded ----------------------------------------------------------------

test("the history is bounded, and drops the oldest first", () => {
  // Unbounded growth in hashed state is a save that gets slower every year.
  const state = blank();
  for (let i = 0; i < HISTORY_CAP + 40; i += 1) {
    state.tick = i;
    historyPass(state);
  }
  assert.equal(state.history.samples.length, HISTORY_CAP);
  assert.equal(state.history.samples[0].tick, 40, "the oldest samples should have gone");
  assert.equal(state.history.samples[HISTORY_CAP - 1].tick, HISTORY_CAP + 39);
});

test("a sample carries every field the hash writes, and nothing else", () => {
  // A field in the sample and not in HISTORY_FIELDS would be copied and saved
  // and never hashed — the exact shape of a desync nobody can reproduce.
  const sample = sampleOf(blank());
  assert.deepEqual(Object.keys(sample).sort(), [...HISTORY_FIELDS].sort());
  for (const [field, value] of Object.entries(sample)) {
    assert.ok(Number.isInteger(value), `${field} is ${value}, which is not an integer`);
  }
});

// --- hashed, copied, saved --------------------------------------------------

test("the history reaches the hash", () => {
  const state = blank();
  const before = hashState(state);
  historyPass(state);
  assert.notEqual(hashState(state), before, "a new sample must move the hash");
});

test("copyState deep-copies the history rather than sharing it", () => {
  // A shared nested object lets a copy mutate the original, which is how a
  // "deterministic" engine stops being one.
  const state = blank();
  historyPass(state);
  const clone = copyState(state);
  clone.history.samples[0].population = 999;
  clone.history.samples.push(sampleOf(state));
  assert.notEqual(state.history.samples[0].population, 999);
  assert.equal(state.history.samples.length, 1);
  assert.equal(hashState(copyState(state)), hashState(state));
});

test("a saved city remembers its history, hash for hash", () => {
  const state = blank();
  for (let i = 0; i < 5; i += 1) { state.tick = i * 12; historyPass(state); }
  const before = hashState(state);
  const restored = fromSave(toSave(state));
  assert.ok(restored.ok, restored.reason);
  assert.equal(restored.state.history.samples.length, 5);
  assert.equal(hashState(restored.state), before);
});

test("a save written before history loads with an empty one", () => {
  // Older saves have no `history` key at all. An empty history is the truth —
  // the city has no recorded past — and it hashes to a length of zero, which is
  // what that save's own checksum was computed against.
  const state = blank();
  const save = toSave(state);
  delete save.history;
  const restored = fromSave(save);
  assert.ok(restored.ok, restored.reason);
  assert.deepEqual(restored.state.history.samples, []);
});

test("a running game records months, silently", () => {
  // Routine ticks must not emit events (CLAUDE.md): a sample is the most
  // routine thing that happens, and an event a month would be fixture drift.
  const state = blank();
  const kinds = new Set();
  for (let tick = 0; tick < 60; tick += 1) {
    for (const event of apply(state, { type: CMD_TICK }).events ?? []) kinds.add(event.kind);
  }
  assert.ok(state.history.samples.length > 0, "a running game recorded nothing");
  assert.equal([...kinds].some((k) => /history|sample/i.test(k)), false, [...kinds].join(", "));
});

// --- the readings -----------------------------------------------------------

test("every series names a field the engine actually samples", () => {
  assert.deepEqual(unknownFields(), []);
});

test("every statistic has an explanation, in both locales", () => {
  // §30: "Statistics are always accompanied by a plain-language
  // interpretation. This is an accessibility feature as much as a usability
  // one." A graph with no sentence is a decoration.
  const dir = join(repoRoot, "data", "i18n");
  const locales = Object.fromEntries(
    readdirSync(dir).filter((n) => n.endsWith(".json"))
      .map((n) => [n.replace(".json", ""), JSON.parse(readFileSync(join(dir, n), "utf8"))]),
  );
  for (const [name, catalogue] of Object.entries(locales)) {
    for (const series of SERIES) {
      assert.ok(Object.hasOwn(catalogue, series.labelKey), `${name} has no ${series.labelKey}`);
      assert.ok(Object.hasOwn(catalogue, series.aboutKey), `${name} has no ${series.aboutKey}`);
      assert.ok(catalogue[series.aboutKey].length > 40,
        `${name}:${series.aboutKey} is too short to explain anything`);
    }
  }
});

test("a reading knows the difference between up and better", () => {
  // The whole point of `good`. Crime rising 40% and treasury rising 40% are
  // the same arrow and opposite news.
  const rising = Array.from({ length: 13 }, (_, i) => ({ crime: 100 + i * 10, treasury: 100 + i * 10 }));
  const crime = reading(rising, SERIES.find((s) => s.field === "crime"));
  const money = reading(rising, SERIES.find((s) => s.field === "treasury"));
  assert.equal(crime.direction, 1);
  assert.equal(money.direction, 1);
  assert.equal(crime.sign, "bad");
  assert.equal(money.sign, "good");
});

test("a series with no good direction reports movement without a verdict", () => {
  const rising = Array.from({ length: 13 }, (_, i) => ({ demandR: 100 + i * 10 }));
  const demand = reading(rising, SERIES.find((s) => s.field === "demandR"));
  assert.equal(demand.sign, "none", "demand going up is neither good nor bad");
  assert.equal(demand.verdictKey, "stat.verdict.rising");
});

test("small movement reads as steady rather than as news", () => {
  const wobble = Array.from({ length: 13 }, (_, i) => ({ population: 1000 + (i % 2) }));
  assert.equal(reading(wobble, SERIES.find((s) => s.field === "population")).verdictKey,
    "stat.verdict.steady");
});

test("a young city says so instead of drawing a flat line", () => {
  assert.equal(reading([], SERIES[0]).verdictKey, "stat.verdict.tooSoon");
  assert.equal(reading([{ population: 5 }], SERIES[0]).verdictKey, "stat.verdict.tooSoon");
});

test("a change from nothing is not an infinite change", () => {
  const fromZero = Array.from({ length: 13 }, (_, i) => ({ population: i === 0 ? 0 : 400 }));
  assert.equal(changeOver(fromZero, "population", WINDOW), 0,
    "a city going from no residents to four hundred has started, not grown by infinity");
});

test("a sparkline spans its box, and a flat series draws down the middle", () => {
  const rising = Array.from({ length: 5 }, (_, i) => ({ population: i }));
  const line = points(rising, "population", 100, 40);
  assert.equal(line.length, 5);
  assert.equal(line[0].x, 0);
  assert.equal(line[4].x, 100);
  assert.equal(line[0].y, 40, "the lowest value sits at the bottom");
  assert.equal(line[4].y, 0, "the highest sits at the top");

  const flat = Array.from({ length: 5 }, () => ({ population: 7 }));
  const level = points(flat, "population", 100, 40);
  assert.ok(level.every((p) => p.y === 20), "a flat series must not divide by zero");
});

test("statistics report the latest value of every series", () => {
  const state = blank();
  state.population = 1234;
  historyPass(state);
  const rows = statistics(state);
  assert.equal(rows.length, SERIES.length);
  assert.equal(rows.find((r) => r.field === "population").value, 1234);
});

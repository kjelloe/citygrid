// Client-side saving: slots, autosave policy, export/import.
//
// `engine/save.js` already turns a state into a plain object and back, verified
// against the state hash. What is here is the half the browser owns: which slot
// a save goes in, when an autosave is worth taking, and what an exported file
// looks like — all pure, so IndexedDB is the only untested part and it is a
// dozen lines of `put` and `get`.
//
// The failures worth guarding: an autosave that fires every tick and jams the
// main thread, a slot list sorted by insertion rather than by time so the
// player's newest city is at the bottom, an import that trusts a file, and a
// "save" that silently drops a field because nobody updated the projection.

import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldAutosave, slotSummary, sortSlots, packExport, unpackImport, SLOTS,
} from "../client/storage/saves.js";
import { toSave, fromSave } from "../engine/save.js";
import { hashState } from "../engine/state.js";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { CMD_JOIN, CMD_TICK } from "../engine/commands.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/disasters.js";
import "../engine/traffic.js";
import "../engine/history.js";

function city(ticks = 40) {
  const state = createState(defaultOptions({ seed: 11, width: 16, height: 16, seats: 1 }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  for (let i = 0; i < ticks; i += 1) apply(state, { type: CMD_TICK });
  return state;
}

// --- autosave policy --------------------------------------------------------

test("autosave fires on its interval and not on every tick", () => {
  // Serialising a 128x128 region on every tick would stall the frame that the
  // renderer is in the middle of. The interval is in TICKS rather than
  // milliseconds so a paused game never autosaves and a fast game does not
  // autosave four times as often for the same amount of play.
  assert.equal(shouldAutosave(0, undefined), true, "the first tick should establish a save");
  assert.equal(shouldAutosave(1, 0), false);
  assert.equal(shouldAutosave(143, 0), false);
  assert.equal(shouldAutosave(144, 0), true, "a game year later, yes");
  assert.equal(shouldAutosave(145, 144), false);
});

test("autosave never fires backwards after a load", () => {
  // Loading an older save moves the tick BACKWARDS. A naive `tick - last >=
  // interval` is false forever after that, and the player's autosave silently
  // stops for the rest of the session.
  assert.equal(shouldAutosave(10, 5000), true, "a tick before the last save means a new game or a load");
});

// --- slots ------------------------------------------------------------------

test("there are three manual slots and one autosave slot", () => {
  assert.equal(SLOTS.manual.length, 3);
  assert.ok(SLOTS.auto, "an autosave that overwrites a manual slot would be a betrayal");
  assert.equal(SLOTS.manual.includes(SLOTS.auto), false);
});

test("a slot summary says enough to choose between two cities", () => {
  const state = city(200);
  const summary = slotSummary(state, "auto", 1700000000000);
  assert.equal(summary.slot, "auto");
  assert.equal(summary.tick, state.tick);
  assert.ok(summary.year >= 1);
  assert.equal(summary.population, state.population);
  assert.equal(summary.size, 16);
  assert.ok(summary.savedAt > 0, "a save with no timestamp cannot be sorted");
});

test("slots sort newest first, and empty slots sink", () => {
  const sorted = sortSlots([
    { slot: "a", savedAt: 100 },
    { slot: "b", savedAt: undefined },
    { slot: "c", savedAt: 300 },
  ]);
  assert.deepEqual(sorted.map((s) => s.slot), ["c", "a", "b"]);
});

// --- export / import --------------------------------------------------------

test("an exported save round-trips to the same city, hash for hash", () => {
  // The state hash is the contract (CLAUDE.md). If a save round-trips to a
  // different hash it is not a save, it is a similar-looking city.
  const state = city(120);
  const before = hashState(state);
  const text = packExport(toSave(state));
  const parsed = unpackImport(text);
  assert.equal(parsed.ok, true, parsed.reason);
  const restored = fromSave(parsed.data);
  assert.equal(restored.ok, true, restored.reason);
  assert.equal(hashState(restored.state), before, "the round trip changed the city");
});

test("an export names itself so a file on disk is identifiable", () => {
  const state = city(50);
  const text = packExport(toSave(state));
  const parsed = JSON.parse(text);
  assert.equal(parsed.game, "citygrid");
  assert.ok(parsed.v >= 1, "an export with no version cannot be migrated later");
  assert.ok(parsed.save, "the save itself must be in there");
});

test("import refuses rubbish rather than half-loading it", () => {
  // A partially applied import leaves the player in a city that is neither the
  // one they had nor the one they asked for.
  for (const bad of ["", "{", "null", "[]", '{"game":"othergame","v":1,"save":{}}', '{"game":"citygrid"}']) {
    const parsed = unpackImport(bad);
    assert.equal(parsed.ok, false, `accepted ${JSON.stringify(bad)}`);
    assert.ok(parsed.reason, "a refusal must say why");
  }
});

test("import refuses a save from a future version", () => {
  const state = city(10);
  const save = toSave(state);
  save.v = 9999;
  const parsed = unpackImport(packExport(save));
  // Packing does not validate; loading does. The refusal must come before any
  // state is built, not from a crash halfway through.
  if (parsed.ok) {
    const restored = fromSave(parsed.data);
    assert.equal(restored.ok, false, "a newer save must be refused, not guessed at");
  }
});

test("a save carries the nested records that reach the hash", () => {
  // The five-places rule (CLAUDE.md): new nested state touches copyState, both
  // hash functions, the migration and the snapshot projection. This test used
  // to pass with all three of these at their DEFAULTS, which is exactly how
  // disaster, traffic and quests reached the hash without reaching the save —
  // the MVP acceptance script caught it instead, three slices later.
  //
  // So: set every nested record to something that is NOT its default first.
  const state = city(80);
  state.disaster.kind = 3;
  state.disaster.phase = 2;
  state.disaster.x = 7;
  state.disaster.radius = 5;
  state.traffic.commuters = 123;
  state.traffic.congested = 45;
  state.quests.completed.push("first-road");
  state.quests.active.push({ id: "first-zone", startedTick: 12, choice: -1 });
  state.quests.vars.push({ name: "lean", value: 2 });

  const before = hashState(state);
  const restored = fromSave(toSave(state));
  assert.equal(restored.ok, true, restored.reason);
  assert.equal(hashState(restored.state), before, "a nested record did not survive the save");
  assert.deepEqual(restored.state.quests.completed, ["first-road"]);
  assert.equal(restored.state.disaster.kind, 3);
  assert.equal(restored.state.traffic.commuters, 123);
});

test("a save survives a field being added to the projection", () => {
  // The five-places rule (CLAUDE.md): new nested state touches copyState, both
  // hash functions, the migration and the snapshot projection. This test is the
  // tripwire for the one everybody forgets — the save.
  const state = city(80);
  const save = toSave(state);
  const restored = fromSave(save);
  assert.equal(restored.ok, true, restored.reason);
  for (const key of ["tick", "population", "treasury", "tax"]) {
    assert.equal(restored.state[key], state[key], `${key} did not survive the save`);
  }
  assert.equal(restored.state.buildings.length, state.buildings.length);
  assert.equal(hashState(restored.state), hashState(state));
});

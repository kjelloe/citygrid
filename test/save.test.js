// Saves. The round trip must be exact: a reloaded city is the same city, or
// the save system is worse than useless because the difference is invisible
// until much later.

import test from "node:test";
import assert from "node:assert/strict";
import { createState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { generateWorld } from "../engine/worldgen.js";
import { apply } from "../engine/reducer.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import { toSave, fromSave, encodeLayer, decodeLayer, saveSize, registerMigration } from "../engine/save.js";
import { SAVE_VERSION } from "../shared/protocol.js";
import { CMD_JOIN, CMD_TICK, CMD_PLACE_ROAD, CMD_PAINT_ZONE } from "../engine/commands.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import { ZONE_RESIDENTIAL } from "../engine/constants.js";
import { u8 } from "../shared/arrays.js";

function livedInCity() {
  const world = generateWorld(defaultOptions({ seed: 44, width: 32, height: 32, seats: 2 }));
  assert.ok(world.ok, world.reason);
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Ada" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Bo" });
  const road = [];
  for (let x = 4; x < 20; x += 1) road.push(tileAt(32, x, 10));
  apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns(road) });
  const zone = [];
  for (let x = 4; x < 20; x += 1) zone.push(tileAt(32, x, 9));
  apply(state, { type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns(zone), zone: ZONE_RESIDENTIAL });
  for (let i = 0; i < 400; i += 1) apply(state, { type: CMD_TICK });
  return state;
}

test("run-length coding round-trips a layer exactly", () => {
  const source = u8(100);
  for (let i = 0; i < 100; i += 1) source[i] = i < 40 ? 1 : i < 90 ? 7 : 3;
  const target = u8(100);
  assert.equal(decodeLayer(encodeLayer(source), target), 100);
  assert.deepEqual([...target], [...source]);
});

test("run-length coding handles the degenerate shapes", () => {
  assert.deepEqual(encodeLayer(u8(0)), []);
  const single = u8(1);
  single[0] = 5;
  assert.deepEqual(encodeLayer(single), [5, 1]);
  const alternating = u8(4);
  alternating.set([1, 2, 1, 2]);
  assert.deepEqual(encodeLayer(alternating), [1, 1, 2, 1, 1, 1, 2, 1]);
});

test("a lived-in city survives the round trip byte for byte", () => {
  const state = livedInCity();
  const before = hashState(state);
  assert.ok(state.buildings.length > 0, "the fixture should have grown something");

  const loaded = fromSave(JSON.parse(JSON.stringify(toSave(state))));
  assert.ok(loaded.ok, loaded.reason);
  assert.equal(hashState(loaded.state), before);
});

test("a reloaded city continues identically", () => {
  // The real test of a save is not that it loads — it is that the future is
  // the same afterwards.
  const state = livedInCity();
  const loaded = fromSave(toSave(state));
  assert.ok(loaded.ok, loaded.reason);
  for (let i = 0; i < 200; i += 1) {
    apply(state, { type: CMD_TICK });
    apply(loaded.state, { type: CMD_TICK });
  }
  assert.equal(hashState(loaded.state), hashState(state), "the futures diverged");
});

test("players, buildings and money all come back", () => {
  const state = livedInCity();
  const loaded = fromSave(toSave(state)).state;
  assert.equal(loaded.players.length, state.players.length);
  assert.equal(loaded.players[0].name, "Ada");
  assert.equal(loaded.players[0].treasury, state.players[0].treasury);
  assert.equal(loaded.buildings.length, state.buildings.length);
  assert.equal(loaded.population, state.population);
});

test("a tampered save is refused rather than quietly loaded", () => {
  const state = livedInCity();
  const save = toSave(state);
  save.treasury += 1000000;
  const loaded = fromSave(save);
  assert.equal(loaded.ok, false);
  assert.match(loaded.reason, /hash/);
});

test("a save from a newer build is refused with a clear reason", () => {
  const save = toSave(createState(defaultOptions({ width: 8, height: 8 })));
  save.v = SAVE_VERSION + 5;
  const loaded = fromSave(save);
  assert.equal(loaded.ok, false);
  assert.match(loaded.reason, /newer build/);
});

test("a save from an unknown older version is refused, not guessed at", () => {
  const save = toSave(createState(defaultOptions({ width: 8, height: 8 })));
  save.v = 0;
  const loaded = fromSave(save);
  assert.equal(loaded.ok, false);
  assert.match(loaded.reason, /no migration/);
});

test("a registered migration is applied", () => {
  // Proves the path works before there is anything to migrate, so the first
  // real schema change is a one-line addition rather than a design problem.
  registerMigration(0, (data) => ({ ...data, v: 1, tax: data.tax === undefined ? 7 : data.tax }));
  const state = createState(defaultOptions({ width: 8, height: 8 }));
  const save = toSave(state);
  const old = { ...save, v: 0 };
  delete old.tax;
  const loaded = fromSave(old);
  assert.ok(loaded.ok, loaded.reason);
  assert.equal(loaded.state.tax, 7);
});

test("junk is refused without throwing", () => {
  for (const junk of [undefined, "", 42, [], {}, { v: "one" }]) {
    const loaded = fromSave(junk);
    assert.equal(loaded.ok, false, `${JSON.stringify(junk)} was accepted`);
    assert.ok(typeof loaded.reason === "string");
  }
});

test("an option added since the save was written gets its default", () => {
  // Otherwise it becomes undefined, reaches the hash, and produces a subtly
  // different city from the one that was saved.
  const state = createState(defaultOptions({ width: 8, height: 8 }));
  const save = toSave(state);
  delete save.options.seasonYears;
  delete save.hash;
  const loaded = fromSave(save);
  assert.ok(loaded.ok, loaded.reason);
  assert.equal(loaded.state.options.seasonYears, 25);
});

test("a truncated tile layer is refused", () => {
  const state = createState(defaultOptions({ width: 8, height: 8 }));
  const save = toSave(state);
  save.tiles.terrain = [0, 4];
  const loaded = fromSave(save);
  assert.equal(loaded.ok, false);
  assert.match(loaded.reason, /wrong size/);
});

test("a save of a large region stays a sensible size", () => {
  // The storage budget: a persistent room checkpoints yearly, so a save that
  // is megabytes would make room history unaffordable.
  const world = generateWorld(defaultOptions({ seed: 9, width: 128, height: 128, seats: 16 }));
  assert.ok(world.ok, world.reason);
  const size = saveSize(toSave(world.state));
  assert.ok(size < 400000, `a fresh 128x128 save is ${size} bytes`);
});

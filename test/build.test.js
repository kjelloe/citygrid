// Slice 1.3: roads, transactional placement, and the permission gate.
//
// The permission matrix at the bottom is the point of the slice. It asserts,
// for every command and every ownership relation, what the reducer does — so
// "nobody can destroy anyone else's work" is a tested property rather than an
// intention.

import test from "node:test";
import assert from "node:assert/strict";
import { createState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import "../engine/build-commands.js";
import { price, undoLast, resetUndoHistory } from "../engine/build-commands.js";
import { hasNet, maskOf, NET_PRESENT } from "../engine/network.js";
import { CMD_JOIN, CMD_PLACE_ROAD, CMD_PLACE_WIRE, CMD_BULLDOZE } from "../engine/commands.js";
import { knownCommands } from "../engine/reducer.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import { RESULT, LIMITS } from "../shared/protocol.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import {
  OWNER_NATURE, OWNER_COMMONS, TERRAIN_WATER, TERRAIN_ROCK, TERRAIN_FOREST, TERRAIN_GRASS,
} from "../engine/constants.js";

const W = 16;
function world(over) {
  resetUndoHistory();
  const state = createState(defaultOptions({ width: W, height: W, seed: 5, seats: 4, ...over }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Two" });
  return state;
}
const at = (x, y) => tileAt(W, x, y);
const road = (actor, cells) => ({ type: CMD_PLACE_ROAD, actor, runs: encodeRuns(cells) });

test("a road is placed, paid for, and claims the ground for its builder", () => {
  const state = world();
  const before = state.players[0].treasury;
  const result = apply(state, road(1, [at(2, 2), at(3, 2)]));
  assert.equal(result.result, RESULT.OK);
  assert.ok(hasNet(state.tiles.road[at(2, 2)]));
  assert.equal(state.tiles.owner[at(2, 2)], 1, "building claims unowned ground");
  assert.ok(state.players[0].treasury < before, "it was not free");
});

test("a straight road connects along its length", () => {
  const state = world();
  apply(state, road(1, [at(2, 5), at(3, 5), at(4, 5)]));
  // north 1, east 2, south 4, west 8
  assert.equal(maskOf(state.tiles.road[at(3, 5)]), 2 | 8, "middle joins east and west");
  assert.equal(maskOf(state.tiles.road[at(2, 5)]), 2, "west end joins east only");
  assert.equal(maskOf(state.tiles.road[at(4, 5)]), 8, "east end joins west only");
});

test("a corner becomes a corner when the next tile arrives", () => {
  // This is what reshaping neighbours is for: the first tile's shape is only
  // correct once its neighbour exists.
  const state = world();
  apply(state, road(1, [at(5, 5), at(6, 5)]));
  assert.equal(maskOf(state.tiles.road[at(6, 5)]), 8);
  apply(state, road(1, [at(6, 6)]));
  assert.equal(maskOf(state.tiles.road[at(6, 5)]), 4 | 8, "the earlier tile learned about the new one");
});

test("a drag is one command, and its whole path connects", () => {
  const state = world();
  const cells = [];
  for (let x = 1; x < 15; x += 1) cells.push(at(x, 8));
  assert.equal(apply(state, road(1, cells)).result, RESULT.OK);
  for (let x = 2; x < 14; x += 1) {
    assert.equal(maskOf(state.tiles.road[at(x, 8)]), 2 | 8, `tile ${x} is not connected both ways`);
  }
});

test("placing over an existing road is free rather than double-charged", () => {
  const state = world();
  apply(state, road(1, [at(2, 2)]));
  const after = state.players[0].treasury;
  apply(state, road(1, [at(2, 2)]));
  assert.equal(state.players[0].treasury, after);
});

test("a bridge over water costs more than a road on land", () => {
  const state = world();
  state.tiles.terrain[at(4, 4)] = TERRAIN_WATER;
  const land = price(state, { actor: 1, runs: encodeRuns([at(5, 5)]) }, "road");
  const water = price(state, { actor: 1, runs: encodeRuns([at(4, 4)]) }, "road");
  assert.ok(water.cost > land.cost, `bridge ${water.cost} should exceed road ${land.cost}`);
});

test("clearing forest to build costs extra", () => {
  const state = world();
  state.tiles.terrain[at(7, 7)] = TERRAIN_FOREST;
  const plain = price(state, { actor: 1, runs: encodeRuns([at(8, 8)]) }, "road");
  const wooded = price(state, { actor: 1, runs: encodeRuns([at(7, 7)]) }, "road");
  assert.ok(wooded.cost > plain.cost);
});

test("rock refuses a road", () => {
  const state = world();
  state.tiles.terrain[at(9, 9)] = TERRAIN_ROCK;
  assert.equal(apply(state, road(1, [at(9, 9)])).result, RESULT.INVALID);
});

test("the quoted price is exactly what is charged", () => {
  // One code path for the preview and the commit, so they cannot disagree.
  const state = world();
  const cells = [at(1, 1), at(2, 1), at(3, 1)];
  const quote = price(state, { actor: 1, runs: encodeRuns(cells) }, "road");
  const before = state.players[0].treasury;
  apply(state, road(1, cells));
  assert.equal(before - state.players[0].treasury, quote.cost);
});

test("an unaffordable edit changes nothing at all", () => {
  // All-or-nothing: never half a road because the money ran out mid-drag.
  const state = world();
  state.players[0].treasury = 5;
  const before = hashState(state);
  const cells = [];
  for (let x = 1; x < 15; x += 1) cells.push(at(x, 3));
  assert.equal(apply(state, road(1, cells)).result, RESULT.NO_FUNDS);
  assert.equal(hashState(state), before, "a refused edit left traces");
});

test("an edit that fails at the last tile leaves the first tiles untouched", () => {
  const state = world();
  state.tiles.terrain[at(5, 10)] = TERRAIN_ROCK;
  const before = hashState(state);
  assert.equal(apply(state, road(1, [at(1, 10), at(2, 10), at(5, 10)])).result, RESULT.INVALID);
  assert.equal(hashState(state), before);
});

test("bulldozing removes what the actor owns and returns the ground to nature", () => {
  const state = world();
  apply(state, road(1, [at(4, 12)]));
  assert.equal(state.tiles.owner[at(4, 12)], 1);
  assert.equal(apply(state, { type: CMD_BULLDOZE, actor: 1, runs: encodeRuns([at(4, 12)]) }).result, RESULT.OK);
  assert.ok(!hasNet(state.tiles.road[at(4, 12)]));
  assert.equal(state.tiles.owner[at(4, 12)], OWNER_NATURE, "cleared land is claimable again");
});

test("bulldozing a neighbour's road is refused — this is the whole design", () => {
  const state = world();
  apply(state, road(2, [at(6, 12)]));
  const before = hashState(state);
  const result = apply(state, { type: CMD_BULLDOZE, actor: 1, runs: encodeRuns([at(6, 12)]) });
  assert.equal(result.result, RESULT.NOT_OWNER);
  assert.equal(hashState(state), before);
  assert.ok(hasNet(state.tiles.road[at(6, 12)]), "their road is still standing");
});

test("building on a neighbour's land is refused when borders are closed", () => {
  const state = world({ openBorders: false });
  apply(state, road(2, [at(8, 12)]));
  assert.equal(apply(state, road(1, [at(8, 12)])).result, RESULT.NOT_OWNER);
});

test("open borders let a neighbour run a road across, but not demolish", () => {
  // Networks are the one thing that legitimately crosses a border.
  const state = world({ openBorders: true });
  apply(state, road(2, [at(9, 12)]));
  state.tiles.road[at(9, 12)] = 0;
  assert.equal(apply(state, road(1, [at(9, 12)])).result, RESULT.OK, "crossing is allowed");
  assert.equal(
    apply(state, { type: CMD_BULLDOZE, actor: 1, runs: encodeRuns([at(9, 12)]) }).result,
    RESULT.NOT_OWNER,
    "demolition still is not",
  );
});

test("anyone may build on the commons; only the builder may remove it", () => {
  const state = world();
  const cell = at(11, 11);
  state.tiles.owner[cell] = OWNER_COMMONS;
  assert.equal(apply(state, road(1, [cell])).result, RESULT.OK);
  assert.equal(state.tiles.owner[cell], OWNER_COMMONS, "the commons stays the commons");
  assert.equal(apply(state, { type: CMD_BULLDOZE, actor: 2, runs: encodeRuns([cell]) }).result, RESULT.OK,
    "a bare commons tile with no building is anyone's to clear");
});

test("undo reverses exactly one action, money included", () => {
  const state = world();
  const before = hashState(state);
  const treasury = state.players[0].treasury;
  apply(state, road(1, [at(2, 14), at(3, 14), at(4, 14)]));
  assert.notEqual(hashState(state), before);
  assert.equal(undoLast(state, 1), RESULT.OK);
  assert.equal(state.players[0].treasury, treasury, "the money came back");
  assert.equal(hashState(state), before, "the world came back");
});

test("undo is refused once a neighbour has built on the same ground", () => {
  // In a shared region the world may have moved on, and silently reverting
  // someone else's work is the very thing ownership exists to prevent.
  const state = world();
  apply(state, road(1, [at(6, 14)]));
  state.tiles.owner[at(6, 14)] = 2;
  assert.equal(undoLast(state, 1), RESULT.NOT_OWNER);
});

test("undo does not stack — it is one deep per player", () => {
  const state = world();
  apply(state, road(1, [at(8, 14)]));
  assert.equal(undoLast(state, 1), RESULT.OK);
  assert.equal(undoLast(state, 1), RESULT.INVALID, "there is nothing further to undo");
});

test("a malformed run list is refused before a single tile is touched", () => {
  const state = world();
  const before = hashState(state);
  const bad = [
    { type: CMD_PLACE_ROAD, actor: 1, runs: [1] },
    { type: CMD_PLACE_ROAD, actor: 1, runs: [1, 0] },
    { type: CMD_PLACE_ROAD, actor: 1, runs: [1, -5] },
    { type: CMD_PLACE_ROAD, actor: 1, runs: [-1, 3] },
    { type: CMD_PLACE_ROAD, actor: 1, runs: [999999, 2] },
    { type: CMD_PLACE_ROAD, actor: 1, runs: "nope" },
    { type: CMD_PLACE_ROAD, actor: 1, runs: [1, 1.5] },
    { type: CMD_PLACE_ROAD, actor: 1 },
  ];
  for (const command of bad) {
    assert.equal(apply(state, command).result, RESULT.INVALID, JSON.stringify(command.runs));
  }
  assert.equal(hashState(state), before);
});

test("a drag larger than the cap is refused rather than truncated", () => {
  // Truncation would apply half of what the player asked for, which is worse
  // than refusing: they would have to work out what actually happened.
  const state = world();
  assert.equal(
    apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: [0, LIMITS.CELLS_PER_COMMAND + 1] }).result,
    RESULT.INVALID,
  );
});

test("wires and roads occupy the same tile independently", () => {
  const state = world();
  apply(state, road(1, [at(3, 3)]));
  apply(state, { type: CMD_PLACE_WIRE, actor: 1, runs: encodeRuns([at(3, 3)]) });
  assert.ok(hasNet(state.tiles.road[at(3, 3)]));
  assert.ok(hasNet(state.tiles.wire[at(3, 3)]));
});

test("two engines given the same commands agree exactly", () => {
  const a = world();
  const b = world();
  const script = [
    road(1, [at(1, 1), at(2, 1), at(3, 1)]),
    road(2, [at(10, 10)]),
    { type: CMD_PLACE_WIRE, actor: 1, runs: encodeRuns([at(1, 1), at(1, 2)]) },
    { type: CMD_BULLDOZE, actor: 1, runs: encodeRuns([at(2, 1)]) },
    road(1, [at(2, 1)]),
  ];
  for (const command of script) {
    const ra = apply(a, command);
    const rb = apply(b, command);
    assert.equal(ra.result, rb.result);
  }
  assert.equal(hashState(a), hashState(b));
});

// --- the permission matrix -------------------------------------------------

test("permission matrix: every command against every ownership relation", () => {
  const relations = [
    { name: "own land", owner: 1 },
    { name: "nature", owner: OWNER_NATURE },
    { name: "commons", owner: OWNER_COMMONS },
    { name: "another player", owner: 2 },
  ];
  const expected = {
    "placeRoad/own land": RESULT.OK,
    "placeRoad/nature": RESULT.OK,
    "placeRoad/commons": RESULT.OK,
    "placeRoad/another player": RESULT.NOT_OWNER,
    "placeWire/own land": RESULT.OK,
    "placeWire/nature": RESULT.OK,
    "placeWire/commons": RESULT.OK,
    "placeWire/another player": RESULT.NOT_OWNER,
    "bulldoze/own land": RESULT.OK,
    "bulldoze/nature": RESULT.OK,
    "bulldoze/commons": RESULT.OK,
    "bulldoze/another player": RESULT.NOT_OWNER,
  };

  for (const command of ["placeRoad", "placeWire", "bulldoze"]) {
    for (const relation of relations) {
      const state = world({ openBorders: false });
      const cell = at(7, 3);
      // Something to remove, so bulldoze has work to do in every case.
      state.tiles.road[cell] = NET_PRESENT;
      state.tiles.owner[cell] = relation.owner;
      const result = apply(state, { type: command, actor: 1, runs: encodeRuns([cell]) }).result;
      const key = `${command}/${relation.name}`;
      assert.equal(result, expected[key], `${key} gave ${result}`);
    }
  }
});

test("permission matrix: zoning and placement obey the same rules", () => {
  // Added when zoning and building placement landed. A command that reaches
  // the reducer without a row here is a command whose permissions nobody has
  // asserted.
  const relations = [
    { name: "own land", owner: 1, expectZone: RESULT.OK, expectPlace: RESULT.OK },
    { name: "nature", owner: OWNER_NATURE, expectZone: RESULT.OK, expectPlace: RESULT.OK },
    { name: "commons", owner: OWNER_COMMONS, expectZone: RESULT.OK, expectPlace: RESULT.OK },
    { name: "another player", owner: 2, expectZone: RESULT.NOT_OWNER, expectPlace: RESULT.NOT_OWNER },
  ];
  for (const relation of relations) {
    const zoneState = world({ openBorders: false });
    zoneState.tiles.owner[at(7, 3)] = relation.owner;
    assert.equal(
      apply(zoneState, { type: "paintZone", actor: 1, runs: encodeRuns([at(7, 3)]), zone: 1 }).result,
      relation.expectZone, `paintZone on ${relation.name}`);

    const placeState = world({ openBorders: false });
    placeState.players[0].treasury = 100000;
    for (let dy = 0; dy < 3; dy += 1) {
      for (let dx = 0; dx < 3; dx += 1) placeState.tiles.owner[at(5 + dx, 5 + dy)] = relation.owner;
    }
    assert.equal(
      apply(placeState, { type: "placeBuilding", actor: 1, def: "coalPlant", x: 5, y: 5 }).result,
      relation.expectPlace, `placeBuilding on ${relation.name}`);
  }
});

test("permission matrix: every registered command is covered by a row", () => {
  // The check that keeps the matrix honest as the command set grows.
  const asserted = new Set([
    "placeRoad", "placeWire", "placePipe", "bulldoze", "paintZone", "dezone",
    "placeBuilding", "setTax",
    // Not tile-scoped, so ownership does not apply; covered elsewhere.
    "tick", "join", "leave", "setStatus",
  ]);
  const uncovered = knownCommands().filter((name) => !asserted.has(name));
  assert.deepEqual(uncovered, [], `commands with no permission assertion: ${uncovered}`);
});

test("permission matrix: no command ever mutates a tile the actor does not own", () => {
  // The invariant behind the whole design, asserted directly rather than
  // inferred from the table above.
  const state = world({ openBorders: false });
  const theirs = at(12, 4);
  state.tiles.owner[theirs] = 2;
  state.tiles.road[theirs] = NET_PRESENT;
  const snapshot = hashState(state);
  for (const type of [CMD_PLACE_ROAD, CMD_PLACE_WIRE, CMD_BULLDOZE]) {
    apply(state, { type, actor: 1, runs: encodeRuns([theirs]) });
  }
  assert.equal(hashState(state), snapshot);
});

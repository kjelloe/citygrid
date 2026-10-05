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
import { rules, buildCost } from "../engine/rules.js";
import { hasNet, maskOf, NET_PRESENT } from "../engine/network.js";
import {
  CMD_JOIN, CMD_PLACE_ROAD, CMD_PLACE_WIRE, CMD_PLACE_PIPE, CMD_PLACE_RAIL, CMD_PLACE_BUILDING,
  CMD_BULLDOZE, CMD_UNDO,
} from "../engine/commands.js";
import { knownCommands } from "../engine/reducer.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/requests.js";
import { RESULT, LIMITS } from "../shared/protocol.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import {
  OWNER_NATURE, OWNER_COMMONS, TERRAIN_WATER, TERRAIN_ROCK, TERRAIN_FOREST, TERRAIN_GRASS,
  MODE_SHARED_CITY, MODE_DISTRICTS, MODE_REGION_RIVALS,
} from "../engine/constants.js";
import { ownershipPartitions } from "../engine/permissions.js";

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
  // Bank to bank, because since S13 a run may not start or finish in the river
  // — the price is the same question and a one-tile pier is not a crossing.
  const state = world();
  state.tiles.terrain[at(4, 4)] = TERRAIN_WATER;
  const dry = [at(6, 5), at(7, 5), at(8, 5)];
  const wet = [at(3, 4), at(4, 4), at(5, 4)];
  const land = price(state, { actor: 1, runs: encodeRuns(dry) }, "road");
  const water = price(state, { actor: 1, runs: encodeRuns(wet) }, "road");
  assert.equal(water.result, RESULT.OK, "a bank-to-bank crossing was refused");
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

test("undo is a COMMAND, so it can cross a wire (Q147, W4)", () => {
  // `undoLast` changed the city and was not a command: on a worker it was
  // undoing a copy, and in a room it would change one client's city and desync
  // it. Everything that changes the city must BE a command (plan.md §3.2).
  const state = world();
  const before = hashState(state);
  const treasury = state.players[0].treasury;
  apply(state, road(1, [at(2, 10), at(3, 10)]));
  assert.notEqual(hashState(state), before);

  const outcome = apply(state, { type: CMD_UNDO, actor: 1 });
  assert.equal(outcome.result, RESULT.OK);
  assert.equal(state.players[0].treasury, treasury, "the money came back");
  assert.equal(hashState(state), before, "the world came back");

  // Nothing left to undo, and the refusal is the same one the direct call gave.
  assert.equal(apply(state, { type: CMD_UNDO, actor: 1 }).result, RESULT.INVALID);
  // A seat that never built anything cannot undo somebody else's work.
  apply(state, road(1, [at(5, 10)]));
  assert.equal(apply(state, { type: CMD_UNDO, actor: 2 }).result, RESULT.INVALID);
  assert.ok(state.tiles.road[at(5, 10)] !== 0, "seat 2 undid seat 1's road");
});

test("undo as a command obeys ownership like every other command", () => {
  const state = world();
  apply(state, road(1, [at(7, 10)]));
  state.tiles.owner[at(7, 10)] = 2;
  const before = hashState(state);
  assert.equal(apply(state, { type: CMD_UNDO, actor: 1 }).result, RESULT.NOT_OWNER);
  assert.equal(hashState(state), before, "a refused undo changed the world");
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
    // The third network (T2). Crossing a border needs consent like the others:
    // a railway is the one thing in this game that WANTS to cross one, and the
    // answer is still that it asks first.
    "placeRail/own land": RESULT.OK,
    "placeRail/nature": RESULT.OK,
    "placeRail/commons": RESULT.OK,
    "placeRail/another player": RESULT.NOT_OWNER,
    "bulldoze/own land": RESULT.OK,
    "bulldoze/nature": RESULT.OK,
    "bulldoze/commons": RESULT.OK,
    "bulldoze/another player": RESULT.NOT_OWNER,
  };

  for (const command of ["placeRoad", "placeWire", "placeRail", "bulldoze"]) {
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

test("permission matrix: the request commands, against every relation (X3a)", () => {
  // The inverse of the rows above. The four build commands REFUSE another
  // player's ground; a demolition request is the command that exists *because*
  // they do, so its row is the opposite shape: it is refused everywhere there
  // is nobody to ask, and accepted on exactly the relation the others refuse.
  const relations = [
    { name: "own land", owner: 1, expect: RESULT.INVALID },
    { name: "nature", owner: OWNER_NATURE, expect: RESULT.INVALID },
    { name: "commons", owner: OWNER_COMMONS, expect: RESULT.INVALID },
    { name: "another player", owner: 2, expect: RESULT.OK },
  ];
  for (const command of ["requestDemolition", "reportNuisance"]) {
    for (const relation of relations) {
      const state = world({ openBorders: false });
      const cell = at(7, 3);
      state.tiles.road[cell] = NET_PRESENT;
      state.tiles.owner[cell] = relation.owner;
      const outcome = apply(state, {
        type: command, actor: 1, runs: encodeRuns([cell]), title: "t", reason: "r", offer: 0,
      });
      assert.equal(outcome.result, relation.expect, `${command} on ${relation.name}`);
    }
  }

  // And the two commands that name a record rather than a tile: the owner
  // answers, the sender withdraws, and neither may do the other's half.
  const state = world({ openBorders: false });
  const cell = at(7, 3);
  state.tiles.road[cell] = NET_PRESENT;
  state.tiles.owner[cell] = 2;
  apply(state, { type: "requestDemolition", actor: 1, runs: encodeRuns([cell]), title: "t", reason: "r", offer: 0 });
  const id = state.requests[0].id;
  assert.equal(apply(state, { type: "resolveRequest", actor: 1, id, approve: true }).result,
    RESULT.NOT_OWNER, "the sender answered their own request");
  assert.equal(apply(state, { type: "withdrawRequest", actor: 2, id }).result,
    RESULT.NOT_OWNER, "the owner withdrew somebody else's request");
  assert.equal(apply(state, { type: "resolveRequest", actor: 2, id, approve: false }).result,
    RESULT.OK);

  // `ping` is a camera gesture: it names no tile, owns nothing, and writes
  // nothing — the one command in the game whose permission is only "is a seat".
  const before = hashState(state);
  assert.equal(apply(state, { type: "ping", actor: 1, x: 3, z: 3 }).result, RESULT.OK);
  assert.equal(apply(state, { type: "ping", actor: 9, x: 3, z: 3 }).result, RESULT.INVALID,
    "a seat nobody holds pinged the map");
  assert.equal(hashState(state), before, "a ping wrote to the city");
});

test("permission matrix: a loan is a seat's own books (L1)", () => {
  // Not tile-scoped, so the relations above do not apply — but "whose money is
  // it" very much does: a seat borrows against its own debt and repays its own,
  // and a seat that does not exist cannot do either.
  const state = world();
  state.quests.vars.push({ name: "rank", value: 2 });
  assert.equal(apply(state, { type: "takeLoan", actor: 1, amount: 2000 }).result, RESULT.OK);
  assert.equal(state.players[0].debt, 2000);
  assert.equal(state.players[1].debt, 0, "one seat's loan reached another seat's books");

  // Seat two repays its own nothing, not seat one's debt.
  assert.equal(apply(state, { type: "repayLoan", actor: 2, amount: 2000 }).result, RESULT.INVALID);
  assert.equal(state.players[0].debt, 2000);

  // And a seat nobody holds cannot borrow at all.
  assert.equal(apply(state, { type: "takeLoan", actor: 9, amount: 1000 }).result, RESULT.INVALID);
});

test("permission matrix: every registered command is covered by a row", () => {
  // The check that keeps the matrix honest as the command set grows.
  const asserted = new Set([
    "placeRoad", "placeWire", "placePipe", "placeRail", "bulldoze", "paintZone", "dezone",
    "placeBuilding", "setTax",
    // `undo` is tile-scoped and asserted directly above (Q147): it refuses
    // NOT_OWNER once somebody else owns the ground it would rewind.
    "undo",
    // Not tile-scoped, so ownership does not apply; covered elsewhere.
    // `setFunding` and `setTax` are city-wide policy: see the funding tests in
    // test/civic.test.js, which assert the range and the refusal.
    "tick", "join", "leave", "setStatus", "setFunding",
    // `questChoice` is a card the advisor is holding, not a tile: it names a
    // quest and an option and touches no ground. Covered by test/quests.test.js.
    // It appears here at all because T5's `engine/unlock.js` reads the rank out
    // of `engine/quests.js`, which put the quest pass in this file's module
    // graph for the first time — a no-op, since the quest catalogue is empty
    // until an adapter loads one.
    "questChoice",
    // X3a's five, asserted in the row above and in test/requests.test.js.
    "requestDemolition", "resolveRequest", "withdrawRequest", "reportNuisance", "ping",
    // L1's two: a loan is a seat's own books, not a tile, so ownership does not
    // apply — the row below asserts what DOES, which is that a seat can only
    // borrow against its own debt.
    "takeLoan", "repayLoan",
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

// --- a network refuses a building (slice G1; A85, Q116) ----------------------

test("a road, a wire and a pipe over a building are each refused, and change nothing", () => {
  // One rule across four networks instead of three-and-a-half. Rail has
  // refused a building since A66 — `clearOfBuildings` on its spec alone — and
  // road, wire and pipe have been laid straight across one since slice 1.3. A
  // line through a building is not a level crossing, whichever line it is.
  //
  // The park is 1x1 and cheap, which keeps the assertion about the refusal
  // rather than about the money.
  const state = world();
  state.players[0].treasury = 100000;
  assert.equal(apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x: 4, y: 4, def: "park" }).result,
    RESULT.OK, "the park was not placed, so this test proves nothing");
  const before = hashState(state);

  for (const type of [CMD_PLACE_ROAD, CMD_PLACE_WIRE, CMD_PLACE_PIPE, CMD_PLACE_RAIL]) {
    assert.equal(apply(state, { type, actor: 1, runs: encodeRuns([at(4, 4)]) }).result,
      RESULT.NEEDS_BULLDOZE, `${type} was laid through a building`);
  }
  // Not "the tile is clear" — the whole state, because a refusal that charged
  // for the run or claimed the ground would pass a per-tile check.
  assert.equal(hashState(state), before, "a refused network edit changed the state");
});

test("a run that crosses one building is refused whole", () => {
  // The transaction rule (slice 1.3) applied to the new refusal: an edit that
  // fails at the last tile leaves the first tiles alone. A drag-paint across a
  // city is one command, so the alternative is a line with a hole in it and a
  // player who paid for both halves.
  const state = world();
  state.players[0].treasury = 100000;
  apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x: 8, y: 8, def: "park" });
  const before = hashState(state);
  const run = [at(6, 8), at(7, 8), at(8, 8), at(9, 8)];

  assert.equal(apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns(run) }).result,
    RESULT.NEEDS_BULLDOZE);
  assert.equal(hashState(state), before, "the tiles before the building were kept");
  assert.ok(!hasNet(state.tiles.road[at(6, 8)]), "the first tile of a refused run was laid");
});

test("the refusal names the ground, not the owner", () => {
  // A building of the actor's OWN is still a building. The old behaviour was
  // not a permission rule — it let a player bury their own park under a road —
  // so the result code must be the one that tells the player what to do about
  // it, and `canConnectAcross` must not get there first.
  const state = world({ openBorders: false });
  state.players[1].treasury = 100000;
  apply(state, { type: CMD_PLACE_BUILDING, actor: 2, x: 11, y: 11, def: "park" });
  assert.equal(apply(state, { type: CMD_PLACE_ROAD, actor: 2, runs: encodeRuns([at(11, 11)]) }).result,
    RESULT.NEEDS_BULLDOZE, "a player burying their own building got a different answer");
});

// --- a road refuses the ground a lot refuses (slice J3; A112, Q140) ----------

test("a network refuses a slope a street could not climb, and says so", () => {
  // Era 20 put the slope rule in `canZone` and `placeNetwork` never got it, so
  // the city stayed off the cliff and the STREETS did not: on a played `hilly`
  // 128 the deputy paves up a 500% hillside to reach the next flat patch, and
  // 218 of 612 corridors end up steeper than any grading can flatten.
  //
  // One rule, both directions, same limit, same code.
  // Along the RUN, which is what a street climbs: a lot refuses ground too rough
  // to stand on (`slopeAt`, every direction) and a road refuses a climb too
  // steep to drive. A street running along a contour across a hillside has a
  // gentle grade and a steep neighbour, and the first cut of this refused it —
  // which took a played `hilly` city from 1,872 residents to 217.
  const state = world();
  state.players[0].treasury = 100000;
  const limit = rules().development.maxRoadSlope;
  state.tiles.elevation[at(8, 8)] = state.tiles.elevation[at(7, 8)] + limit + 1;
  const before = hashState(state);

  for (const type of [CMD_PLACE_ROAD, CMD_PLACE_WIRE, CMD_PLACE_PIPE, CMD_PLACE_RAIL]) {
    assert.equal(apply(state, { type, actor: 1, runs: encodeRuns([at(7, 8), at(8, 8)]) }).result,
      "tooSteep", `${type} was laid up a cliff`);
  }
  assert.equal(hashState(state), before, "a refused network edit changed the state");

  // And ACROSS the same cliff is fine: the street runs along the contour.
  state.tiles.elevation[at(8, 9)] = state.tiles.elevation[at(8, 8)];
  assert.equal(apply(state, road(1, [at(8, 8), at(8, 9)])).result, RESULT.OK,
    "a street along a contour was refused for the hill beside it");
});

test("a run that crosses a cliff is refused whole, and a slope at the limit is not", () => {
  const state = world();
  state.players[0].treasury = 100000;
  const limit = rules().development.maxRoadSlope;
  state.tiles.elevation[at(6, 10)] = state.tiles.elevation[at(7, 10)] + limit + 2;
  const before = hashState(state);
  assert.equal(apply(state, road(1, [at(4, 10), at(5, 10), at(6, 10), at(7, 10)])).result, "tooSteep");
  assert.equal(hashState(state), before, "the tiles before the cliff were kept");

  // Exactly AT the limit is pavable: the rule is "steeper than a street may
  // climb", and a street may climb the limit itself.
  state.tiles.elevation[at(4, 12)] = state.tiles.elevation[at(5, 12)] + limit;
  assert.equal(apply(state, road(1, [at(4, 12)])).result, RESULT.OK,
    `a slope of exactly ${limit} was refused`);
});

// --- the bridge, engine half (slice S13; A84, A111 / Q104) -------------------

/** Water from `x0` to `x1` on row `y`, with land either side. */
function river(state, y, x0, x1) {
  for (let x = x0; x <= x1; x += 1) state.tiles.terrain[at(x, y)] = TERRAIN_WATER;
}

test("a road may cross water from bank to bank, and is charged the water price", () => {
  // The engine has always allowed this and charges `build.roadOverWater` for it
  // — A84 believed otherwise, because no 64x64 deputy city had ever paved one,
  // and H7's played 96 has ten road tiles standing on shallow water (A111). So
  // the rule S13 adds is not permission: it is a SPAN, and an end on dry land.
  const state = world();
  state.players[0].treasury = 100000;
  river(state, 6, 6, 7);
  const before = state.players[0].treasury;
  const run = [at(5, 6), at(6, 6), at(7, 6), at(8, 6)];
  assert.equal(apply(state, road(1, run)).result, RESULT.OK, "a bank-to-bank crossing was refused");
  assert.ok(hasNet(state.tiles.road[at(6, 6)]), "the water tile carries no road");
  const paid = before - state.players[0].treasury;
  assert.ok(paid > 4 * buildCost(state, "road"),
    `${paid} is not more than four plain road tiles — the water price was not charged`);
});

test("a crossing that ends on the water is refused", () => {
  // A pier is not a bridge. The run has to REACH the far bank, or the city on
  // the other side is still not part of the city.
  const state = world();
  state.players[0].treasury = 100000;
  river(state, 8, 6, 9);
  const before = hashState(state);
  assert.equal(apply(state, road(1, [at(5, 8), at(6, 8), at(7, 8)])).result, RESULT.INVALID,
    "a road was laid into the river and left there");
  assert.equal(hashState(state), before, "a refused crossing changed the state");
});

test("a span longer than `build.bridgeSpan` is refused", () => {
  const state = world();
  state.players[0].treasury = 1000000;
  const span = rules().build.bridgeSpan;
  river(state, 10, 3, 3 + span);            // one tile wider than the span allows
  const before = hashState(state);
  const run = [];
  for (let x = 2; x <= 5 + span; x += 1) run.push(at(x, 10));
  assert.equal(apply(state, road(1, run)).result, RESULT.INVALID,
    `a ${span + 1}-tile span was accepted against a limit of ${span}`);
  assert.equal(hashState(state), before);

  // And exactly at the span is a bridge.
  const ok = world();
  ok.players[0].treasury = 1000000;
  river(ok, 10, 3, 2 + span);
  const fits = [];
  for (let x = 2; x <= 4 + span; x += 1) fits.push(at(x, 10));
  assert.equal(apply(ok, road(1, fits)).result, RESULT.OK,
    `a span of exactly ${span} was refused`);
});

test("what Districts actually refuses, and what it does not (review round)", () => {
  // `ownershipPartitions` and `isCooperative` state, as functions, what the
  // permission rules do per mode — and the omissions sweep found that **nothing
  // calls either of them**. Writing their reader found the gap they would have
  // prevented: `canBuildOn` carries the Districts rule ("unclaimed land inside
  // somebody's district is theirs to develop") and has exactly ONE caller,
  // `placeBuilding`. Roads, wires, pipes and rails go through
  // `canConnectAcross`, which lets anybody cross unowned ground — so in
  // Districts a seat may pave straight across another seat's district and may
  // not put a hut on it.
  //
  // **Decided and built at X3d (2026-10-06).** A network crosses a district the
  // way it crosses a border: with CONSENT, not for free. So the road is refused
  // in Districts with `openBorders` off, allowed with it on, and a building is
  // refused either way — a right of way is not a land grab.
  const cell = at(7, 3);
  // One state per question: the park the first half places occupies the tile
  // the second half wants, and `needsBulldoze` is not an answer about districts.
  const inSomebodyElses = (mode) => {
    const fresh = () => {
      const state = world({ mode, openBorders: false });
      state.tiles.owner[cell] = OWNER_NATURE;
      state.tiles.district[cell] = 2;
      return state;
    };
    return {
      building: apply(fresh(), { type: CMD_PLACE_BUILDING, actor: 1, def: "park", x: 7, y: 3 }).result,
      road: apply(fresh(), { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns([cell]) }).result,
    };
  };

  const districts = inSomebodyElses(MODE_DISTRICTS);
  assert.equal(districts.building, RESULT.OUT_OF_SECTOR,
    "Districts let a seat build inside another seat's district");
  assert.equal(districts.road, RESULT.OUT_OF_SECTOR,
    "a seat may still pave straight across another seat's district (X3d)");

  // With the border open, the road goes through and the building still does
  // not: consent is a right of way, not a right to develop.
  const open = (mode) => {
    const fresh = () => {
      const state = world({ mode, openBorders: true });
      state.tiles.owner[cell] = OWNER_NATURE;
      state.tiles.district[cell] = 2;
      return state;
    };
    return {
      building: apply(fresh(), { type: CMD_PLACE_BUILDING, actor: 1, def: "park", x: 7, y: 3 }).result,
      road: apply(fresh(), { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns([cell]) }).result,
    };
  };
  const consented = open(MODE_DISTRICTS);
  assert.equal(consented.road, RESULT.OK, "an open border does not let a road through a district");
  assert.equal(consented.building, RESULT.OUT_OF_SECTOR,
    "an open border let a seat develop inside another seat's district");

  // And one's OWN district is open, with the border shut.
  const mine = world({ mode: MODE_DISTRICTS, openBorders: false });
  mine.tiles.owner[cell] = OWNER_NATURE;
  mine.tiles.district[cell] = 1;
  assert.equal(apply(mine, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns([cell]) }).result,
    RESULT.OK, "a seat cannot pave its own district");

  // Shared City is the cooperative one: neither refusal exists.
  const shared = inSomebodyElses(MODE_SHARED_CITY);
  assert.equal(shared.building, RESULT.OK);
  assert.equal(shared.road, RESULT.OK);

  // And the predicate that now carries the rule says which modes partition
  // ownership. `isCooperative` was its opposite and had no caller but this
  // line; X3d gave `ownershipPartitions` a real one and the other was deleted.
  assert.equal(ownershipPartitions(MODE_SHARED_CITY), false);
  assert.equal(ownershipPartitions(MODE_DISTRICTS), true);
  assert.equal(ownershipPartitions(MODE_REGION_RIVALS), true);
});

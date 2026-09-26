// Water bodies, the marina, the ferry and the port (slice T4a; A67, A68).
//
// A lake and a river are the same tiles to every other system in this game.
// What makes them different is one question — does this water reach the edge
// of the region — and three buildings hang off the answer: a marina is worth
// having on a big pond, a ferry terminal on a lake is a building that costs
// upkeep and does nothing, and the inspector has to say which before the money
// is spent.
//
// Derived, never stored, like T2's `railReach`: ask twice and the state is
// byte-identical.

import test from "node:test";
import assert from "node:assert/strict";
import { createState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { rules } from "../engine/rules.js";
import { CMD_JOIN, CMD_PLACE_BUILDING, CMD_PLACE_ROAD } from "../engine/commands.js";
import { waterBodies, bodyAt } from "../engine/terrain.js";
import { gateStatus, gateTerms } from "../engine/gates.js";
import { TERRAIN_WATER, TERRAIN_SHALLOW, TERRAIN_GRASS, FLAG_POWERED } from "../engine/constants.js";
import { RESULT } from "../shared/protocol.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/economy.js";
import "../engine/utilities.js";
import "../engine/civic.js";

const W = 24;
const at = (x, y) => tileAt(W, x, y);

function dry() {
  const state = createState(defaultOptions({ width: W, height: W, seed: 5 }));
  for (let i = 0; i < state.tiles.terrain.length; i += 1) state.tiles.terrain[i] = TERRAIN_GRASS;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  return state;
}

/** Fills a rectangle with water. */
function flood(state, x0, y0, x1, y1, kind = TERRAIN_WATER) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) state.tiles.terrain[at(x, y)] = kind;
  }
}

/** A river from the west edge to the east, and a lake in the middle of the
 * land below it. */
function riverAndLake() {
  const state = dry();
  flood(state, 0, 4, W - 1, 5);
  // Big enough to be a harbour (`marinaMinBody`) and nowhere near an edge, so
  // "dead" is about the SEA rather than about the size.
  flood(state, 8, 13, 15, 18);
  return state;
}

function power(state, building) {
  for (let dy = 0; dy < building.h; dy += 1) {
    for (let dx = 0; dx < building.w; dx += 1) {
      state.tiles.flags[at(building.x + dx, building.y + dy)] |= FLAG_POWERED;
    }
  }
}

/** Puts a road along the north side of a footprint, so road access is not what
 * makes a gate dead. */
function road(state, x, y, w) {
  const cells = [];
  for (let k = 0; k < w; k += 1) cells.push(at(x + k, y));
  apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns(cells) });
}

// --- the bodies --------------------------------------------------------------

test("a river touches two edges, a lake touches none, and both are counted", () => {
  const state = riverAndLake();
  const bodies = waterBodies(state);
  assert.equal(bodies.length, 2, `${bodies.length} bodies`);

  const river = bodies.find((b) => b.edge);
  const lake = bodies.find((b) => !b.edge);
  assert.ok(river && lake, "the river and the lake did not come out as two bodies");
  assert.equal(river.size, W * 2);
  assert.equal(lake.size, 8 * 6);
  assert.equal(river.edgeTiles, 4, "a two-tile river across the map has four tiles on a border");
  assert.equal(lake.edgeTiles, 0);
});

test("shallow water is the same body as the deep water it rings", () => {
  // `isWater` is both, and a shore is where the shallows are — a body split in
  // two at its own shelf would make every lake a ring of ponds.
  const state = dry();
  flood(state, 8, 8, 13, 13, TERRAIN_SHALLOW);
  flood(state, 9, 9, 12, 12, TERRAIN_WATER);
  const bodies = waterBodies(state);
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].size, 36);
});

test("bodyAt finds the body a shore tile touches, and nothing inland", () => {
  const state = riverAndLake();
  const bodies = waterBodies(state);
  // A tile just south of the river.
  const shore = bodyAt(state, bodies, 6, 6);
  assert.ok(shore, "the tile beside the river touches no body");
  assert.equal(shore.edge, true);
  // And one in the middle of the land.
  assert.equal(bodyAt(state, bodies, 3, 11), undefined);
  // A 2×2 footprint counts as touching if ANY of its ring does.
  assert.ok(bodyAt(state, bodies, 6, 6, 2, 2));
});

test("asking about the water never writes to the state", () => {
  const state = riverAndLake();
  const pinned = hashState(state);
  waterBodies(state);
  bodyAt(state, waterBodies(state), 6, 6);
  assert.equal(hashState(state), pinned);
});

// --- the marina --------------------------------------------------------------

test("a marina needs a body big enough, and a pond is not one", () => {
  const big = dry();
  flood(big, 6, 6, 15, 15);            // 100 tiles
  road(big, 4, 4, 2);
  assert.ok(rules().harbour.marinaMinBody <= 100, "the fixture's body is too small to be a marina's");
  assert.equal(apply(big, { type: CMD_PLACE_BUILDING, actor: 1, x: 4, y: 5, def: "marina" }).result,
    RESULT.OK);

  const pond = dry();
  flood(pond, 6, 6, 7, 7);             // 4 tiles
  assert.equal(apply(pond, { type: CMD_PLACE_BUILDING, actor: 1, x: 4, y: 5, def: "marina" }).result,
    RESULT.INVALID, "a marina was built on a puddle");
});

test("a marina inland is refused wherever the water is", () => {
  const state = dry();
  flood(state, 6, 6, 15, 15);
  assert.equal(apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x: 1, y: 1, def: "marina" }).result,
    RESULT.INVALID, "a marina was built in a field");
});

// --- the sea gates -----------------------------------------------------------

test("a ferry terminal on a river is live; the same terminal on a lake is dead", () => {
  const state = riverAndLake();
  // The river is rows 4–5, so a 2×2 at row 6 stands on its south bank; its
  // road goes BELOW the footprint, not through it.
  road(state, 4, 8, 2);
  const placed = apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x: 4, y: 6, def: "ferryTerminal" });
  assert.equal(placed.result, RESULT.OK, "a terminal on a river was refused");
  const terminal = state.buildings.find((b) => b.def === "ferryTerminal");
  power(state, terminal);
  assert.equal(gateStatus(state, terminal).live, true, gateStatus(state, terminal).reason);

  // The lake, rows 13–18: the same building, the same power, the same road.
  road(state, 8, 10, 2);
  const onLake = apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x: 8, y: 11, def: "ferryTerminal" });
  assert.equal(onLake.result, RESULT.OK, "a terminal may be BUILT on a lake — it is dead, not refused");
  const stuck = state.buildings.find((b) => b.def === "ferryTerminal" && b.y === 11);
  assert.ok(stuck, "the lake terminal was not built");
  power(state, stuck);
  const status = gateStatus(state, stuck);
  assert.equal(status.live, false);
  assert.equal(status.reason, "noSea", `a terminal on a lake is dead because: ${status.reason}`);
});

test("a freight port is a sea gate too, with the industry's terms", () => {
  const state = riverAndLake();
  road(state, 4, 8, 3);
  assert.equal(apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x: 4, y: 6, def: "freightPort" }).result,
    RESULT.OK);
  const port = state.buildings.find((b) => b.def === "freightPort");
  power(state, port);
  assert.equal(gateStatus(state, port).gate, "sea");
  assert.equal(gateStatus(state, port).live, true);

  const terms = gateTerms(state);
  const sea = rules().gate.sea;
  assert.equal(terms.industrial, sea.industrial, "a port added no industrial demand");
  assert.ok(sea.industrial > sea.residential, "a freight port is a passenger terminal");
});

test("a gate on the water needs a shore, like every other building on one", () => {
  const state = dry();
  assert.equal(apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x: 4, y: 6, def: "ferryTerminal" }).result,
    RESULT.INVALID, "a ferry terminal was built in a field");
});

test("every reason a sea gate can be dead has a key", () => {
  // The same two-list check T2's rail gate keeps: a reason the rules can give
  // and the inspector cannot name is a row that says `gate.somethingNew`.
  const state = riverAndLake();
  road(state, 8, 10, 2);
  apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x: 8, y: 11, def: "ferryTerminal" });
  const terminal = state.buildings.find((b) => b.def === "ferryTerminal");
  assert.equal(gateStatus(state, terminal).reason, "noSea");
  // Unpowered comes first only once the sea is there; on a lake the water is
  // the answer whatever else is wrong, because it is the one nothing can fix.
  assert.equal(gateStatus(state, terminal).live, false);
});

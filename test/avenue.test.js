// The avenue (slice T1a; A60).
//
// A second road kind: two lanes each way, a median, higher capacity. The
// ENGINE half is a bit on the road layer, a price, a capacity and a routing
// preference — the picture is T1b.
//
// The bit is what makes this delicate. `reshape()` writes `NET_PRESENT | mask`
// every time a neighbour changes, so a kind bit that is not carried through it
// is a kind bit that disappears the moment the next tile is laid beside it —
// which is exactly the shape of defect this project keeps finding by looking.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { trafficPass } from "../engine/traffic.js";
import { rules, buildCost } from "../engine/rules.js";
import { CMD_JOIN, CMD_PLACE_ROAD, CMD_BULLDOZE } from "../engine/commands.js";
import { NET_PRESENT, NET_AVENUE, isAvenue } from "../engine/network.js";
import { ZONE_RESIDENTIAL, ZONE_COMMERCIAL } from "../engine/constants.js";
import { RESULT } from "../shared/protocol.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/traffic.js";

const W = 32;
const at = (x, y) => tileAt(W, x, y);

function world(seats = 2) {
  const state = createState(defaultOptions({ width: W, height: W, seed: 5, seats }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  if (seats > 1) apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Two" });
  return state;
}

const lay = (actor, cells, kind) => ({ type: CMD_PLACE_ROAD, actor, runs: encodeRuns(cells), kind });
const row = (y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, k) => at(x0 + k, y));

// --- the kind bit ---------------------------------------------------------------

test("an avenue is a road with a kind bit, and a road is not", () => {
  const state = world();
  assert.equal(apply(state, lay(1, row(4, 2, 6), "avenue")).result, RESULT.OK);
  assert.equal(apply(state, lay(1, row(8, 2, 6))).result, RESULT.OK);
  for (const x of [2, 4, 6]) {
    assert.equal(isAvenue(state.tiles.road[at(x, 4)]), true, `the avenue at ${x},4 lost its kind`);
    assert.equal(isAvenue(state.tiles.road[at(x, 8)]), false, `the road at ${x},8 became an avenue`);
  }
  // And both are roads, so everything that reads `NET_PRESENT` is unchanged.
  assert.ok((state.tiles.road[at(4, 4)] & NET_PRESENT) !== 0);
});

test("the kind survives the next tile laid beside it", () => {
  // `reshape` rewrites `NET_PRESENT | mask` on every neighbour change. A kind
  // bit that is not carried through it vanishes when the road grows.
  const state = world();
  apply(state, lay(1, row(4, 2, 6), "avenue"));
  const before = state.tiles.road[at(6, 4)];
  apply(state, lay(1, [at(7, 4)], "avenue"));
  assert.equal(isAvenue(state.tiles.road[at(6, 4)]), true, "the avenue forgot its kind when the road grew");
  assert.notEqual(state.tiles.road[at(6, 4)], before, "the tile never reshaped, so this proves nothing");
  // A plain road laid against an avenue does not become one.
  apply(state, lay(1, [at(8, 4)]));
  assert.equal(isAvenue(state.tiles.road[at(8, 4)]), false);
  assert.equal(isAvenue(state.tiles.road[at(7, 4)]), true, "the avenue caught the road's kind");
});

test("bulldozing an avenue leaves bare ground, kind and all", () => {
  const state = world();
  apply(state, lay(1, row(4, 2, 6), "avenue"));
  assert.equal(apply(state, { type: CMD_BULLDOZE, actor: 1, runs: encodeRuns([at(4, 4)]) }).result, RESULT.OK);
  assert.equal(state.tiles.road[at(4, 4)], 0, "something of the avenue is still there");
});

// --- what it costs --------------------------------------------------------------

test("an avenue costs the avenue price, and more than a road", () => {
  const state = world();
  assert.ok(buildCost(state, "avenue") > buildCost(state, "road"),
    "an avenue is no dearer than a road");
  const before = state.players[0].treasury;
  apply(state, lay(1, row(4, 2, 6), "avenue"));
  const spent = before - state.players[0].treasury;
  assert.equal(spent, 5 * buildCost(state, "avenue"), `five tiles of avenue cost ${spent}`);
});

test("an unknown kind is refused rather than built as a road", () => {
  const state = world();
  const out = apply(state, lay(1, row(4, 2, 6), "boulevard"));
  assert.equal(out.result, RESULT.INVALID, "a kind nobody knows was built anyway");
  assert.equal(state.tiles.road[at(4, 4)], 0);
});

test("an avenue obeys the same ownership rule as a road", () => {
  // Same command, same permission — so the test is not what the rule IS but
  // that the kind does not change it. Asserting the rule itself here would be a
  // second copy of `permissions.js` in a test file.
  const roads = world();
  apply(roads, lay(1, row(4, 2, 6)));
  const overRoad = apply(roads, lay(2, [at(4, 4)])).result;

  const avenues = world();
  apply(avenues, lay(1, row(4, 2, 6), "avenue"));
  const overAvenue = apply(avenues, lay(2, [at(4, 4)], "avenue")).result;

  assert.equal(overAvenue, overRoad,
    `a seat may build over another's road (${overRoad}) but not their avenue (${overAvenue})`);
});

// --- what it carries ------------------------------------------------------------

/** A street of homes and jobs, all on one kind. */
function commuterStreet(state, kind, y) {
  apply(state, lay(1, row(y, 2, 26), kind));
  let id = state.buildings.length + 1;
  for (let i = 0; i < 8; i += 1) {
    state.buildings.push({
      id, def: "res", zone: ZONE_RESIDENTIAL, x: 2 + i, y: y + 1, w: 1, h: 1,
      level: 1, occupancy: 40, condition: 100, owner: 1,
    });
    state.tiles.buildingId[at(2 + i, y + 1)] = id;
    id += 1;
  }
  for (let i = 0; i < 2; i += 1) {
    state.buildings.push({
      id, def: "com", zone: ZONE_COMMERCIAL, x: 26 - i, y: y + 1, w: 1, h: 1,
      level: 1, occupancy: 10, condition: 100, owner: 1,
    });
    state.tiles.buildingId[at(26 - i, y + 1)] = id;
    id += 1;
  }
  state.nextId = id;
}

test("an avenue carries twice a road's load before it reads as full", () => {
  const capacity = rules().traffic;
  assert.ok(capacity.avenueCapacity >= 2, `an avenue holds ${capacity.avenueCapacity}× a road`);
  const roadCity = world(1);
  commuterStreet(roadCity, undefined, 10);
  trafficPass(roadCity);
  const avenueCity = world(1);
  commuterStreet(avenueCity, "avenue", 10);
  trafficPass(avenueCity);
  assert.ok(roadCity.traffic.congested > 0, "the road street is not busy enough to prove anything");
  assert.ok(avenueCity.traffic.congested < roadCity.traffic.congested,
    `the avenue was as congested as the road (${avenueCity.traffic.congested} against ${roadCity.traffic.congested})`);
  // The same traffic, on the same street: only the kind differs.
  assert.equal(avenueCity.traffic.commuters, roadCity.traffic.commuters);
});

test("the commuter field routes onto an avenue when one is offered", () => {
  // Two ways to work of the SAME length — a road across and an avenue two
  // tiles south, joined at both ends — so the only thing that can decide it is
  // what a tile costs to cross. The first version of this test made the avenue
  // the longer way round by one step, the two routes came out within a step of
  // each other, and the tie went to whichever neighbour `drive` looked at
  // first: a test that would have passed on a coin toss.
  const state = world(1);
  apply(state, lay(1, row(10, 6, 20)));
  apply(state, lay(1, [at(6, 11), at(20, 11)]));
  apply(state, lay(1, row(12, 6, 20), "avenue"));
  state.buildings.push({ id: 1, def: "res", zone: ZONE_RESIDENTIAL, x: 5, y: 10, w: 1, h: 1,
    level: 1, occupancy: 200, condition: 100, owner: 1 });
  state.tiles.buildingId[at(5, 10)] = 1;
  state.buildings.push({ id: 2, def: "com", zone: ZONE_COMMERCIAL, x: 21, y: 10, w: 1, h: 1,
    level: 1, occupancy: 40, condition: 100, owner: 1 });
  state.tiles.buildingId[at(21, 10)] = 2;
  state.nextId = 3;
  trafficPass(state);
  const onRoad = state.tiles.traffic[at(13, 10)];
  const onAvenue = state.tiles.traffic[at(13, 12)];
  assert.ok(onAvenue > onRoad,
    `the traffic stayed on the road (avenue ${onAvenue}, road ${onRoad})`);
});

// --- upgrading a street ----------------------------------------------------------

test("an avenue laid over a road upgrades it, and is charged for", () => {
  // The gesture that makes the kind worth having: a player widens the street
  // their traffic is on. Without it the only avenues are new ones on fresh
  // ground, and the deputy's first avenue carried exactly zero commuters on
  // four played cities.
  const state = world();
  apply(state, lay(1, row(4, 2, 6)));
  const before = state.players[0].treasury;
  assert.equal(apply(state, lay(1, row(4, 2, 6), "avenue")).result, RESULT.OK);
  for (const x of [2, 4, 6]) {
    assert.equal(isAvenue(state.tiles.road[at(x, 4)]), true, `the road at ${x},4 was not widened`);
  }
  const spent = before - state.players[0].treasury;
  assert.equal(spent, 5 * buildCost(state, "avenue"), `widening five tiles cost ${spent}`);
});

test("a road drawn across an avenue leaves it an avenue", () => {
  // The other direction is not a downgrade: drawing a street across a main road
  // should not quietly narrow it, and "already there is free" is the rule
  // everywhere else.
  const state = world();
  apply(state, lay(1, row(4, 2, 6), "avenue"));
  const before = state.players[0].treasury;
  apply(state, lay(1, [at(4, 4)]));
  assert.equal(isAvenue(state.tiles.road[at(4, 4)]), true, "a road narrowed the avenue");
  assert.equal(state.players[0].treasury, before, "the player paid for a road they already had");
});

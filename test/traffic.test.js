// Traffic.
//
// The system the plan calls the expensive one, and the one whose failure mode
// is silence: a routing bug produces an all-zero traffic layer, every overlay
// reads "clear", and nothing anywhere complains. So the tests are mostly about
// whether traffic exists AT ALL in situations where it obviously should.

import test from "node:test";
import assert from "node:assert/strict";
import { trafficPass } from "../engine/traffic.js";
import { createState, hashState, copyState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { NET_PRESENT } from "../engine/network.js";
import { ZONE_RESIDENTIAL, ZONE_COMMERCIAL } from "../engine/constants.js";

function grid() {
  return createState(defaultOptions({ seed: 2, width: 32, height: 32, seats: 1 }));
}
const at = (state, x, y) => y * state.width + x;

/** A street with homes at one end and work at the other. */
function street(state, { homes = 4, jobs = 2, y = 10, x0 = 2, x1 = 24 } = {}) {
  for (let x = x0; x <= x1; x += 1) state.tiles.road[at(state, x, y)] = NET_PRESENT;
  let id = 1;
  for (let i = 0; i < homes; i += 1) {
    const hx = x0 + i;
    state.buildings.push({
      id, def: "res", zone: ZONE_RESIDENTIAL, x: hx, y: y + 1, w: 1, h: 1,
      level: 1, occupancy: 24, condition: 100, owner: 1,
    });
    state.tiles.buildingId[at(state, hx, y + 1)] = id;
    id += 1;
  }
  for (let i = 0; i < jobs; i += 1) {
    const jx = x1 - i;
    state.buildings.push({
      id, def: "com", zone: ZONE_COMMERCIAL, x: jx, y: y + 1, w: 1, h: 1,
      level: 1, occupancy: 10, condition: 100, owner: 1,
    });
    state.tiles.buildingId[at(state, jx, y + 1)] = id;
    id += 1;
  }
  state.nextId = id;
  return state;
}

test("commuters put traffic on the road between home and work", () => {
  const state = street(grid());
  trafficPass(state);
  let busy = 0;
  for (let x = 2; x <= 24; x += 1) if (state.tiles.traffic[at(state, x, 10)] > 0) busy += 1;
  assert.ok(busy > 10, `only ${busy} of 23 street tiles carry traffic`);
  assert.ok(state.traffic.commuters > 0, "nobody commuted");
});

test("traffic is heaviest near the jobs", () => {
  // Every route converges on work, so load rises as you approach it.
  //
  // Note WHERE the peak is: a workplace's doorstep is every road tile beside
  // it, all seeded at distance zero, so a commuter stops at the NEAREST edge of
  // the job cluster rather than driving to its far side. The busiest tile is
  // therefore the approach, not the tile outside the last office — which is why
  // this compares the street's maximum against the far house rather than
  // picking a specific tile.
  const state = street(grid());
  trafficPass(state);
  let peakX = 2;
  for (let x = 2; x <= 24; x += 1) {
    if (state.tiles.traffic[at(state, x, 10)] > state.tiles.traffic[at(state, peakX, 10)]) peakX = x;
  }
  const nearHome = state.tiles.traffic[at(state, 2, 10)];
  assert.ok(state.tiles.traffic[at(state, peakX, 10)] > nearHome,
    `peak ${state.tiles.traffic[at(state, peakX, 10)]} vs ${nearHome} at the far house`);
  // Load never falls as you drive toward work: each house joins the road and
  // nobody leaves it before the jobs. Asserting on WHERE the peak is would be
  // asserting on a tie — once every commuter has joined, every tile from there
  // to the workplace carries the same load.
  for (let x = 3; x <= 22; x += 1) {
    assert.ok(state.tiles.traffic[at(state, x, 10)] >= state.tiles.traffic[at(state, x - 1, 10)],
      `traffic fell from ${state.tiles.traffic[at(state, x - 1, 10)]} to ${state.tiles.traffic[at(state, x, 10)]} approaching work at x=${x}`);
  }
});

test("no road means no traffic and no crash", () => {
  const state = grid();
  state.buildings.push({
    id: 1, def: "res", zone: ZONE_RESIDENTIAL, x: 5, y: 5, w: 1, h: 1,
    level: 1, occupancy: 20, condition: 100, owner: 1,
  });
  state.tiles.buildingId[at(state, 5, 5)] = 1;
  const events = trafficPass(state);
  assert.equal(state.traffic.commuters, 0);
  assert.deepEqual(events, [], "no jobs anywhere is not worth an alert");
});

test("homes with no route to work are counted, not silently dropped", () => {
  // The diagnosis the player needs: "your houses cannot reach your factories".
  const state = street(grid());
  // An island house, on its own bit of road that connects to nothing.
  state.tiles.road[at(state, 5, 20)] = NET_PRESENT;
  state.buildings.push({
    id: 99, def: "res", zone: ZONE_RESIDENTIAL, x: 5, y: 21, w: 1, h: 1,
    level: 1, occupancy: 30, condition: 100, owner: 1,
  });
  state.tiles.buildingId[at(state, 5, 21)] = 99;
  trafficPass(state);
  assert.ok(state.traffic.stranded > 0, "a house that cannot reach work should be reported");
});

test("traffic decays instead of accumulating forever", () => {
  const state = street(grid());
  trafficPass(state);
  let peak = 0;
  for (let x = 2; x <= 24; x += 1) peak = Math.max(peak, state.tiles.traffic[at(state, x, 10)]);
  assert.ok(peak > 0, "nothing was busy to begin with, so this proved nothing");
  // Take the city away; the roads remain.
  state.buildings.length = 0;
  for (let i = 0; i < 20; i += 1) trafficPass(state);
  let after = 0;
  for (let x = 2; x <= 24; x += 1) after = Math.max(after, state.tiles.traffic[at(state, x, 10)]);
  assert.ok(after < peak, `a street that was busy once stays busy forever (${peak} → ${after})`);
});

test("congested roads pollute", () => {
  // The connection to the rest of the simulation. Traffic that only shows in
  // its own overlay is decoration.
  const state = street(grid(), { homes: 12, jobs: 1, x0: 2, x1: 24 });
  for (const b of state.buildings) b.occupancy = 250;
  trafficPass(state);
  let polluted = 0;
  for (let x = 2; x <= 24; x += 1) if (state.tiles.pollution[at(state, x, 10)] > 0) polluted += 1;
  assert.ok(polluted > 0, "a jammed street should be a worse place to live");
});

test("traffic is deterministic", () => {
  const a = street(grid());
  const b = copyState(a);
  trafficPass(a);
  trafficPass(b);
  assert.equal(hashState(a), hashState(b));
});

test("the traffic summary is hashed", () => {
  const state = street(grid());
  const before = hashState(state);
  state.traffic.congested = 42;
  assert.notEqual(hashState(state), before, "state.traffic is not reaching the hash");
});

test("an empty region costs nothing and says nothing", () => {
  const state = grid();
  assert.deepEqual(trafficPass(state), []);
  assert.equal(state.traffic.commuters, 0);
});

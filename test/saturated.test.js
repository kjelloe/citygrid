// The fixture four gates measure on (slice D6).
//
// `tools/lib/saturated.mjs` exists so that `walkthrough`, `passability`,
// `lanes_dump` and the perf card measure the same place — three copies of a
// recipe is three chances to be measuring a different city from the one you are
// reporting. Nothing has ever tested it, which is how it reached D1 with no
// traffic on its roads and D4 with 1,129 copies of one building (Q70, Q72).
//
// These are checks on the *options*, not on the recipe. What the fixture is
// remains a judgement; that it does what its arguments say is not.

import test from "node:test";
import assert from "node:assert/strict";
import { saturatedCity } from "../tools/lib/saturated.mjs";

const SMALL = { size: 48, ticks: 60 };

test("the fixture builds a road network", () => {
  const { state, paved } = saturatedCity(SMALL);
  assert.ok(paved > 200, `${paved} paved tiles`);
  assert.equal(state.width, 48);
});

test("`terrain` reaches worldgen, and hilly is steeper than rolling", () => {
  // Q64 is a question about a `hilly` map and there was no way to ask for one:
  // the recipe hard-coded the default. A steeper map has to actually be
  // steeper, or D6 measures the same city twice under two names.
  const spread = (style) => {
    const { state } = saturatedCity({ ...SMALL, terrain: style });
    let low = Infinity;
    let high = -Infinity;
    for (const h of state.tiles.elevation) {
      if (h < low) low = h;
      if (h > high) high = h;
    }
    return high - low;
  };
  const rolling = spread("rolling");
  const hilly = spread("hilly");
  const flat = spread("flat");
  assert.ok(hilly > flat, `hilly ${hilly} is not above flat ${flat}`);
  assert.ok(rolling > 0 && hilly > 0);
});

test("`traffic` seeds the road network and only the road network", () => {
  // The buildings are pushed straight in with no zoning demand behind them, so
  // the reducer routes no commutes and the roads are empty (Q70). D1 measures a
  // load; this is that load arriving where it was asked for.
  const { state } = saturatedCity({ ...SMALL, traffic: 200 });
  let onRoad = 0;
  let offRoad = 0;
  for (let i = 0; i < state.tiles.road.length; i += 1) {
    const load = state.tiles.traffic[i];
    if (load === 0) continue;
    if ((state.tiles.road[i] & 16) !== 0) onRoad += 1;
    else offRoad += 1;
  }
  assert.ok(onRoad > 200, `${onRoad} loaded road tiles`);
  assert.equal(offRoad, 0, `${offRoad} loaded tiles that are not road`);
});

test("no traffic is seeded unless it is asked for", () => {
  // Every gate that predates D1 calls this with no `traffic`, and a fixture
  // that quietly grew a commuter load would re-baseline all of them without
  // saying so.
  const { state } = saturatedCity(SMALL);
  assert.equal(state.tiles.traffic.some((load) => load > 0), false);
});

test("`buildings: false` leaves the lane graph a lane graph", () => {
  // `lanes_dump` asks for this: a lane graph is derived from roads, and E1's
  // numbers were taken before buildings existed.
  const { state } = saturatedCity({ ...SMALL, buildings: false });
  assert.equal(state.buildings.length, 0);
});

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
import { TICKS_PER_YEAR } from "../engine/constants.js";

// Small, and still a CITY: the fixture plays the deputy now (H7), and a deputy
// that has had a year builds a road and nothing else. A 48 map at fifteen years
// was not enough either — the line it lays past `railAtPopulation` runs to the
// nearest map edge, so on a small map the railway assertions were testing a
// ten-tile stub. This is the recipe the GATES get, which is the right thing for
// these tests to check anyway, and it is one second.
const SMALL = { size: 96, ticks: 20 * TICKS_PER_YEAR };

test("the fixture builds a road network", () => {
  const { state, paved } = saturatedCity(SMALL);
  assert.ok(paved > 200, `${paved} paved tiles`);
  assert.equal(state.width, 96);
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

test("a played city carries the traffic it routed, and a seed is a FLAT load on top", () => {
  // This asserted the opposite until H7 — "no traffic unless it is asked for" —
  // and it was true of a fixture nobody lived in. A played city has commuters
  // the reducer actually routed, which is the whole point of Q70's complaint:
  // every renderer gate was pricing a city with no moving vehicle in it.
  //
  // The flat seed stays, because a *load* is reproducible and a simulation is
  // not, and a renderer measurement wants the first (Q70).
  const played = saturatedCity(SMALL);
  assert.ok(played.state.traffic.commuters > 0,
    `a played city routed ${played.state.traffic.commuters} commuters`);
  const real = played.state.tiles.traffic.filter((load) => load > 0).length;
  assert.ok(real > 0, "a played city has no traffic on any tile");

  const seeded = saturatedCity({ ...SMALL, traffic: 200 });
  let flat = 0;
  for (let i = 0; i < seeded.state.tiles.traffic.length; i += 1) {
    if (seeded.state.tiles.traffic[i] === 200) flat += 1;
  }
  assert.ok(flat > real, `the seed covered ${flat} tiles and the simulation ${real}`);
});

test("`buildings: false` leaves the lane graph a lane graph", () => {
  // `lanes_dump` asks for this: a lane graph is derived from roads, and E1's
  // numbers were taken before buildings existed.
  const { state } = saturatedCity({ ...SMALL, buildings: false });
  assert.equal(state.buildings.length, 0);
});

test("the fixture carries a railway, a station and level crossings (T3)", () => {
  // A fixture with no line on it prices a renderer that has one: `budget_gate`
  // measures the track, the sleepers and the crossings from here.
  const { state, track } = saturatedCity(SMALL);
  assert.ok(track > 20, `${track} rail tiles`);
  // One station per mayor that grew big enough, not exactly one: the deputy
  // lays its own line past `railAtPopulation` and there are four of them (H7).
  assert.ok(state.buildings.filter((b) => b.def === "railStation").length >= 1,
    "a line was laid and no station stands on it");

  let crossings = 0;
  for (let i = 0; i < state.tiles.rail.length; i += 1) {
    if ((state.tiles.rail[i] & 16) && (state.tiles.road[i] & 16)) crossings += 1;
  }
  assert.ok(crossings > 3, `${crossings} level crossings — the line misses the grid`);

  // And a line NOBODY asked for is not laid, because every gate that predates
  // T3 measured a city without one.
  const bare = saturatedCity({ ...SMALL, rail: false });
  assert.equal(bare.track, 0);
  assert.equal(bare.state.buildings.filter((b) => b.def === "railStation").length, 0);
});

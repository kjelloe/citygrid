// Slice 1.4: zoning, the regional demand pool, lots, growth and decay.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { createState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import "../engine/build-commands.js";
import {
  developmentPass, computeDemand, census, hasRoadAccess, landValueAt,
} from "../engine/development.js";
import { CMD_JOIN, CMD_PAINT_ZONE, CMD_DEZONE, CMD_TICK, CMD_BULLDOZE, CMD_PLACE_BUILDING } from "../engine/commands.js";
import { utilitiesPass } from "../engine/utilities.js";
import { rules } from "../engine/rules.js";
import "../engine/utilities.js";
import { RESULT } from "../shared/protocol.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import { NET_PRESENT } from "../engine/network.js";
import {
  ZONE_NONE, ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL,
  TERRAIN_WATER, TICKS_PER_MONTH, OWNER_NATURE, FLAG_POWERED, FLAG_WATERED,
} from "../engine/constants.js";

const W = 20;
const at = (x, y) => tileAt(W, x, y);
/** Placed buildings (plants, pumps) are buildings too, so a count of "what
 * grew" has to exclude them. */
const lots = (state) => state.buildings.filter((b) => b.zone !== ZONE_NONE);

function city(over) {
  const state = createState(defaultOptions({ width: W, height: W, seed: 3, seats: 2, ...over }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Two" });
  state.players[0].treasury = 1000000;
  return state;
}

/** A road along y, carrying power and water, with the row above it zoned.
 * Utilities are part of a street now: nothing develops where nothing can be
 * supplied (gamedesign 8.2), so a test fixture that only lays tarmac builds
 * a city that can never grow. */
function street(state, y, zone, x0 = 2, x1 = 12, actor = 1) {
  const road = [];
  for (let x = x0; x <= x1; x += 1) road.push(at(x, y));
  for (const index of road) {
    state.tiles.road[index] = NET_PRESENT;
    state.tiles.wire[index] = NET_PRESENT;
    state.tiles.pipe[index] = NET_PRESENT;
  }
  const cells = [];
  for (let x = x0; x <= x1; x += 1) cells.push(at(x, y - 1));
  const result = apply(state, { type: CMD_PAINT_ZONE, actor, runs: encodeRuns(cells), zone });
  supply(state, actor);
  return result;
}

/** A plant and a pump on a spine at x=15, with every street wired into it.
 * Carriers have to actually reach the producer — a stretch of wire with no
 * plant on it supplies nothing, which is the point of the whole system. */
function supply(state, actor = 1) {
  if (!state.buildings.some((b) => b.def === "coalPlant")) {
    apply(state, { type: CMD_PLACE_BUILDING, actor, def: "coalPlant", x: 16, y: 2 });
    apply(state, { type: CMD_PLACE_BUILDING, actor, def: "groundwaterPump", x: 16, y: 8 });
    for (let y = 0; y < W; y += 1) {
      state.tiles.wire[at(15, y)] = NET_PRESENT;
      state.tiles.pipe[at(15, y)] = NET_PRESENT;
    }
  }
  // Join any row that already carries a network to the spine, bridging the
  // whole gap. Filling only the last few columns left streets that stop short
  // of the spine as separate components — three networks, one plant, nothing
  // supplied.
  for (let y = 0; y < W; y += 1) {
    let last = -1;
    for (let x = 0; x < 15; x += 1) if (state.tiles.wire[at(x, y)] !== 0) last = x;
    if (last < 0) continue;
    for (let x = last; x <= 15; x += 1) {
      state.tiles.wire[at(x, y)] = NET_PRESENT;
      state.tiles.pipe[at(x, y)] = NET_PRESENT;
    }
  }
  utilitiesPass(state);
}

/** Development needs the supply pass to have run, exactly as the monthly
 * tick order does it. */
function months(state, count) {
  for (let i = 0; i < count; i += 1) {
    utilitiesPass(state);
    developmentPass(state);
  }
}

test("zoning costs money and claims unowned ground", () => {
  const state = city();
  const before = state.players[0].treasury;
  const result = apply(state, {
    type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns([at(3, 3), at(4, 3)]), zone: ZONE_RESIDENTIAL,
  });
  assert.equal(result.result, RESULT.OK);
  assert.equal(state.tiles.zone[at(3, 3)], ZONE_RESIDENTIAL);
  assert.equal(state.tiles.owner[at(3, 3)], 1);
  assert.ok(state.players[0].treasury < before);
});

test("water cannot be zoned", () => {
  const state = city();
  state.tiles.terrain[at(5, 5)] = TERRAIN_WATER;
  assert.equal(apply(state, {
    type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns([at(5, 5)]), zone: ZONE_RESIDENTIAL,
  }).result, RESULT.INVALID);
});

test("an invalid zone type is refused", () => {
  const state = city();
  for (const zone of [0, 4, -1, undefined, "residential", 1.5]) {
    assert.equal(apply(state, {
      type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns([at(6, 6)]), zone,
    }).result, RESULT.INVALID, `zone ${String(zone)} was accepted`);
  }
});

test("zoning a neighbour's land is refused", () => {
  const state = city({ openBorders: false });
  state.tiles.owner[at(7, 7)] = 2;
  assert.equal(apply(state, {
    type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns([at(7, 7)]), zone: ZONE_RESIDENTIAL,
  }).result, RESULT.NOT_OWNER);
});

test("a developed lot must be demolished, not dezoned", () => {
  // Dezoning a building would delete someone's property through the back
  // door, bypassing the permission the whole design rests on.
  const state = city();
  street(state, 5, ZONE_RESIDENTIAL);
  months(state, 6);
  const built = lots(state)[0];
  assert.ok(built, "nothing developed");
  const index = at(built.x, built.y);
  assert.equal(apply(state, { type: CMD_DEZONE, actor: 1, runs: encodeRuns([index]) }).result,
    RESULT.NEEDS_BULLDOZE);
});

test("nothing develops without road access", () => {
  const state = city();
  const cells = [];
  for (let x = 2; x < 10; x += 1) cells.push(at(x, 8));
  apply(state, { type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns(cells), zone: ZONE_RESIDENTIAL });
  supply(state, 1);
  months(state, 12);
  assert.equal(lots(state).length, 0, "buildings appeared with no road");
});

test("road access is measured around the whole footprint", () => {
  const state = city();
  state.tiles.road[at(5, 9)] = NET_PRESENT;
  assert.ok(hasRoadAccess(state, 5, 8, 1, 1), "adjacent tile has access");
  assert.ok(hasRoadAccess(state, 4, 8, 2, 1), "a wider lot still touches it");
  assert.ok(!hasRoadAccess(state, 5, 6, 1, 1), "two tiles away does not");
});

test("zoned land beside a road develops", () => {
  const state = city();
  street(state, 5, ZONE_RESIDENTIAL);
  months(state, 10);
  assert.ok(lots(state).length > 0, "nothing developed beside a road");
  assert.ok(lots(state).every((b) => b.zone === ZONE_RESIDENTIAL));
});

test("a zoned tile that carries a road grows no lot, and its neighbours still do", () => {
  // G1 (A85), the other half of "a network refuses a building": `lotFree` is
  // `placeBuilding`'s counterpart for a lot nobody placed, and it never read
  // the road layer — so a block of zoning painted across a street grew houses
  // on the carriageway. 90.9 of 295 buildings in the median deputy city, for
  // the life of the project, and nothing could see it: the lot had road access
  // by definition and the tile hashed perfectly well.
  //
  // Zoning over a road stays legal — it is intent, and this is the rule that
  // reads it.
  const state = city();
  street(state, 5, ZONE_RESIDENTIAL);
  // Zone the street itself, which is what a player dragging a block does.
  const onTheRoad = [];
  for (let x = 2; x <= 12; x += 1) onTheRoad.push(at(x, 5));
  assert.equal(apply(state, { type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns(onTheRoad), zone: ZONE_RESIDENTIAL }).result,
    RESULT.OK, "zoning across a road was refused — this rule is about development, not zoning");
  supply(state, 1);
  months(state, 12);

  const paved = lots(state).filter((b) => {
    for (let dy = 0; dy < b.h; dy += 1) {
      for (let dx = 0; dx < b.w; dx += 1) {
        if (state.tiles.road[at(b.x + dx, b.y + dy)] !== 0) return true;
      }
    }
    return false;
  });
  assert.deepEqual(paved.map((b) => `${b.x},${b.y} ${b.w}x${b.h}`), [], "a lot grew on a street");
  // And the rule did not simply stop the city: the row above the street is
  // still zoned, still supplied, and still develops.
  assert.ok(lots(state).length > 0, "nothing developed at all, so this proves nothing");
});

test("a wide block of zoning grows into larger lots", () => {
  // Footprints are tried largest first, so dense zoning produces few large
  // lots rather than many small ones (gamedesign 6.3).
  const state = city();
  for (let x = 2; x <= 12; x += 1) {
    state.tiles.road[at(x, 10)] = NET_PRESENT;
    state.tiles.wire[at(x, 10)] = NET_PRESENT;
    state.tiles.pipe[at(x, 10)] = NET_PRESENT;
  }
  const cells = [];
  for (let y = 8; y <= 9; y += 1) for (let x = 2; x <= 12; x += 1) cells.push(at(x, y));
  apply(state, { type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns(cells), zone: ZONE_RESIDENTIAL });
  supply(state, 1);
  months(state, 12);
  assert.ok(lots(state).some((b) => b.w * b.h > 1), "no lot larger than one tile appeared");
});

test("a building owns every tile of its footprint, and only those", () => {
  const state = city();
  street(state, 5, ZONE_RESIDENTIAL);
  months(state, 10);
  for (const building of lots(state)) {
    for (let dy = 0; dy < building.h; dy += 1) {
      for (let dx = 0; dx < building.w; dx += 1) {
        assert.equal(state.tiles.buildingId[at(building.x + dx, building.y + dy)], building.id);
      }
    }
  }
});

test("demand is regional, not per-player (ruling 001)", () => {
  // Two players' lots draw on one pool, so a neighbour's growth is felt.
  const state = city();
  street(state, 5, ZONE_RESIDENTIAL, 2, 8, 1);
  street(state, 9, ZONE_RESIDENTIAL, 2, 8, 2);
  months(state, 10);
  const owners = new Set(lots(state).map((b) => b.owner));
  assert.ok(owners.size > 1, "both players should be developing from the same pool");
  assert.equal(typeof state.demand.residential, "number");
});

test("an empty region wants residents", () => {
  const state = city();
  const demand = computeDemand(state);
  assert.ok(demand.residential > 0, "a new region should attract people");
});

test("vacant housing suppresses residential demand", () => {
  const state = city();
  const empty = computeDemand(state).residential;
  state.buildings.push({
    id: 1, def: "res", zone: ZONE_RESIDENTIAL, x: 1, y: 1, w: 2, h: 2, owner: 1,
    level: 4, valueTier: 0, occupancy: 0, condition: 100, builtTick: 0, flags: 0,
  });
  assert.ok(computeDemand(state).residential < empty, "empty homes should cool demand");
});

test("jobs pull residents and residents pull shops", () => {
  const state = city();
  const base = computeDemand(state);
  state.buildings.push({
    id: 1, def: "ind", zone: ZONE_INDUSTRIAL, x: 1, y: 1, w: 2, h: 2, owner: 1,
    level: 4, valueTier: 0, occupancy: 0, condition: 100, builtTick: 0, flags: 0,
  });
  assert.ok(computeDemand(state).residential > base.residential, "jobs should attract residents");
});

test("taxes drag on demand", () => {
  const state = city();
  state.tax = 0;
  const low = computeDemand(state).residential;
  state.tax = 20;
  const high = computeDemand(state).residential;
  assert.ok(high < low, `tax of 20 should deter (${high} vs ${low})`);
});

test("demand moves toward its target rather than jumping", () => {
  // gamedesign 9.3: changes should not produce their full effect instantly.
  const state = city();
  state.demand = { residential: 0, commercial: 0, industrial: 0 };
  const target = computeDemand(state).residential;
  developmentPass(state);
  const after = state.demand.residential;
  assert.ok(after > 0 && after < target, `expected a partial step, got ${after} toward ${target}`);
});

test("demand stays inside its caps", () => {
  const state = city();
  months(state, 200);
  assert.ok(Math.abs(state.demand.residential) <= 2000);
  assert.ok(Math.abs(state.demand.commercial) <= 1500);
  assert.ok(Math.abs(state.demand.industrial) <= 1500);
});

test("occupancy never exceeds housing", () => {
  const state = city();
  street(state, 5, ZONE_RESIDENTIAL);
  months(state, 40);
  const counts = census(state);
  assert.ok(state.population <= counts.housing, `${state.population} people in ${counts.housing} homes`);
});

test("land value rises beside water and falls beside industry", () => {
  const state = city();
  const plain = landValueAt(state, at(10, 10));
  state.tiles.terrain[at(6, 6)] = TERRAIN_WATER;
  assert.ok(landValueAt(state, at(6, 7)) > plain, "waterfront should be worth more");
  state.tiles.zone[at(15, 14)] = ZONE_INDUSTRIAL;
  assert.ok(landValueAt(state, at(15, 15)) < plain, "beside a factory should be worth less");
});

test("the development pass is deterministic", () => {
  const a = city();
  const b = city();
  street(a, 5, ZONE_RESIDENTIAL);
  street(b, 5, ZONE_RESIDENTIAL);
  for (let i = 0; i < 20; i += 1) {
    developmentPass(a);
    developmentPass(b);
  }
  assert.equal(hashState(a), hashState(b));
});

test("development runs on the monthly tick, not every tick", () => {
  const state = city();
  street(state, 5, ZONE_RESIDENTIAL);
  const placed = state.buildings.length;
  for (let i = 0; i < TICKS_PER_MONTH - 1; i += 1) apply(state, { type: CMD_TICK });
  assert.equal(state.buildings.length, placed, "development ran early");
  for (let i = 0; i < TICKS_PER_MONTH * 12; i += 1) apply(state, { type: CMD_TICK });
  assert.ok(lots(state).length > 0, "development never ran");
});

test("demolishing a lot frees its tiles for something else", () => {
  const state = city();
  street(state, 5, ZONE_RESIDENTIAL);
  months(state, 10);
  const building = lots(state)[0];
  const cells = [];
  for (let dy = 0; dy < building.h; dy += 1) {
    for (let dx = 0; dx < building.w; dx += 1) cells.push(at(building.x + dx, building.y + dy));
  }
  const result = apply(state, { type: CMD_BULLDOZE, actor: 1, runs: encodeRuns(cells) });
  assert.equal(result.result, RESULT.OK);
  assert.equal(state.tiles.zone[cells[0]], ZONE_NONE, "the zoning went with it");
});

// --- decay rolls like growth (slice G4; A92, Q124) ----------------------------

test("a lot below the decay threshold decays one month in `decayOneIn`, not every month", () => {
  // `development.decayOneIn` has been in the ruleset since the pass was written
  // and read by nothing, so growth rolled one month in three and decay rolled
  // nothing at all: decline was three times as fast as growth and nobody chose
  // that (Q124, A92).
  //
  // The assertion is a RATE over a long run, not a single step — one month
  // proves nothing about a one-in-six roll, and a rate is what the constant
  // actually means.
  const spec = rules().development;
  assert.ok(spec.decayOneIn > 1, "decayOneIn is not a roll");

  const state = city();
  street(state, 5, ZONE_RESIDENTIAL);
  supply(state);
  months(state, 40);
  const grown = lots(state);
  assert.ok(grown.length > 0, "nothing developed, so this proves nothing");

  // Now take the supply away, which is the deepest unhappiness there is
  // (`unsuppliedScore`), so every lot is below the decay threshold every month
  // and the only thing between them and the ground is the roll.
  for (let i = 0; i < state.tiles.flags.length; i += 1) {
    state.tiles.flags[i] &= ~(FLAG_POWERED | FLAG_WATERED);
  }
  const watched = grown[0];
  let fell = 0;
  let months_ = 0;
  for (let m = 0; m < 180 && state.buildings.includes(watched); m += 1) {
    const before = watched.condition;
    developmentPass(state);
    months_ += 1;
    if (watched.condition < before) fell += 1;
  }
  assert.ok(months_ > 30, `only ${months_} months before the lot was gone`);
  // Against BOTH constants the pass uses. A lot is only scored when the scan
  // cursor reaches its slice (`scanSlices`, hashed state), so the calendar rate
  // is one in `scanSlices × decayOneIn` and not one in `decayOneIn` — the first
  // cut of this test asserted the second and read 3% against an expected 17%,
  // which is the test being wrong rather than the rule.
  const share = fell / months_;
  const expected = 1 / (spec.scanSlices * spec.decayOneIn);
  assert.ok(share > expected * 0.4 && share < expected * 2.2,
    `condition fell in ${fell} of ${months_} months — ${(share * 100).toFixed(1)}%, `
    + `against one in ${spec.scanSlices} × ${spec.decayOneIn} = ${(expected * 100).toFixed(1)}%`);
  // And the roll is doing something beyond the scan: without it the lot fell
  // every time it was looked at, which is one month in `scanSlices`.
  assert.ok(share < 0.5 / spec.scanSlices,
    `decay still happens on nearly every scan (${(share * 100).toFixed(1)}%)`);
});

test("growth and decay roll with the same kind of odds", () => {
  // The symmetry is the whole point of A92: both are a `chance` against a
  // `…OneIn` from the ruleset, drawn from the world's PRNG.
  const source = readFileSync(join(repoRoot, "engine", "development.js"), "utf8");
  const grow = /chance\(state\.rng, development\.growthOneIn\)/.test(source);
  const decay = /chance\(state\.rng, development\.decayOneIn\)/.test(source);
  assert.ok(grow && decay, `growth rolls: ${grow}, decay rolls: ${decay}`);
});

// --- ground too steep to build on is not zoned (H6; A100, Q134) --------------

test("a slope a street could not climb cannot be zoned, and says so", () => {
  // A100, the expensive option: S11 let a junction move within six metres of its
  // own ground and `hilly` 128 went from 177 cliffs on the walked route to 30.
  // What was left was 20 m corridors with 10 m of land between their ends, which
  // no cutting fixes at 15% — so the city is not on the cliff in the first place.
  //
  // Six elevation steps IS the street's own limit: `road.maxGrade` is 15%, a
  // tile is 20 m and a step is 0.5 m, so 15% of 20 m is 3 m is six steps.
  const state = city();
  const limit = rules().development.maxZoneSlope;
  const flat = at(5, 5);
  const cliff = at(10, 5);
  state.tiles.elevation[cliff] = state.tiles.elevation[at(11, 5)] + limit + 1;

  assert.equal(apply(state, { type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns([flat]), zone: ZONE_RESIDENTIAL }).result,
    RESULT.OK, "flat ground was refused");
  assert.equal(apply(state, { type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns([cliff]), zone: ZONE_RESIDENTIAL }).result,
    "tooSteep", "a cliff was zoned");
  assert.equal(state.tiles.zone[cliff], ZONE_NONE, "the cliff kept the zoning anyway");

  // Exactly AT the limit is buildable: the rule is "steeper than a street may
  // climb", and a street may climb the limit itself.
  const edge = at(14, 5);
  state.tiles.elevation[edge] = state.tiles.elevation[at(15, 5)] + limit;
  assert.equal(apply(state, { type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns([edge]), zone: ZONE_RESIDENTIAL }).result,
    RESULT.OK, `a slope of exactly ${limit} was refused`);
});

test("a run that crosses a cliff is refused whole, like every other edit", () => {
  // The transaction rule (slice 1.3). A drag-paint across a hillside is one
  // command, so the alternative is a block of zoning with a hole in it and a
  // player who paid for both halves.
  const state = city();
  const limit = rules().development.maxZoneSlope;
  state.tiles.elevation[at(8, 7)] = state.tiles.elevation[at(9, 7)] + limit + 2;
  const before = hashState(state);
  const run = [at(6, 7), at(7, 7), at(8, 7), at(9, 7)];
  assert.equal(apply(state, { type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns(run), zone: ZONE_RESIDENTIAL }).result,
    "tooSteep");
  assert.equal(hashState(state), before, "a refused zoning run changed the state");
});


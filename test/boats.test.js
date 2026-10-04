// Boats (slice T4b; ruling 037, D7).
//
// A vessel on land is the single most obvious defect this slice can ship, and
// a screenshot of a still boat cannot tell you whether the moving one will end
// up in a field. So the invariant is asserted over TIME, on a body shaped to
// catch it: a bay with a headland, which a boat sailing a straight line will
// cross and a boat that looks ahead will turn away from.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { CMD_JOIN, CMD_PLACE_BUILDING, CMD_PLACE_ROAD } from "../engine/commands.js";
import { TERRAIN_WATER, TERRAIN_GRASS } from "../engine/constants.js";
import { DEFAULTS } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { createBoats } from "../client/life/boats.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import "../engine/build-commands.js";
import "../engine/utilities.js";

const W = 32;
const SPEC = DEFAULTS.boat;
const at = (x, y) => tileAt(W, x, y);

function dry() {
  const state = createState(defaultOptions({ width: W, height: W, seed: 5 }));
  for (let i = 0; i < state.tiles.terrain.length; i += 1) state.tiles.terrain[i] = TERRAIN_GRASS;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  return state;
}

function flood(state, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) state.tiles.terrain[at(x, y)] = TERRAIN_WATER;
  }
}

/** A bay that reaches the west edge, with a headland jutting into it — so a
 * straight course across the water meets land. */
function bay() {
  const state = dry();
  flood(state, 0, 6, 25, 23);
  // The headland: a tongue of land from the south, up the middle.
  for (let y = 14; y <= 23; y += 1) {
    for (let x = 11; x <= 14; x += 1) state.tiles.terrain[at(x, y)] = TERRAIN_GRASS;
  }
  return state;
}

const run = (boats, seconds, step = 1 / 30) => {
  for (let i = 0; i < Math.round(seconds / step); i += 1) boats.update(step);
};

// --- the invariant -----------------------------------------------------------

test("a boat never crosses a shore, however long it sails", () => {
  const state = bay();
  const model = createModel(state);
  const boats = createBoats(state, model);
  assert.ok(boats.stats().sailing > 0, "the bay carries no boats, so this proves nothing");

  // Ten minutes at thirty steps a second — long enough for a boat to reach
  // the headland from anywhere in the bay several times over.
  let checked = 0;
  for (let i = 0; i < 30 * 600; i += 1) {
    boats.update(1 / 30);
    if (i % 17 !== 0) continue;
    for (const hull of boats.fleet()) {
      if (hull.kind !== "sailing") continue;
      const tile = at(hull.x | 0, hull.z | 0);
      assert.ok(model.water.isWater(tile),
        `a ${hull.kind} boat is on land at ${hull.x.toFixed(2)}, ${hull.z.toFixed(2)}`);
      checked += 1;
    }
  }
  assert.ok(checked > 1000, `only ${checked} positions were checked`);
});

test("a boat keeps clear of the shore, not merely off it", () => {
  // Touching the bank is a boat aground. `ringOf` counts 0 at the water's
  // edge, so a hull is wanted at 2 or more.
  const state = bay();
  const model = createModel(state);
  const boats = createBoats(state, model);
  run(boats, 120);
  for (const hull of boats.fleet()) {
    if (hull.kind !== "sailing") continue;
    const tile = at(hull.x | 0, hull.z | 0);
    assert.ok(model.water.ringOf(tile) >= 1,
      `a boat is ${model.water.ringOf(tile)} tiles from the bank`);
  }
});

test("a pond carries no boats, and a bay carries a few", () => {
  const pond = dry();
  flood(pond, 6, 6, 8, 8);
  assert.equal(createBoats(pond, createModel(pond)).stats().sailing, 0,
    "a nine-tile pond has a sailing boat on it");

  const water = bay();
  const stats = createBoats(water, createModel(water)).stats();
  assert.ok(stats.sailing >= 1 && stats.sailing <= SPEC.perBody,
    `${stats.sailing} boats on one body, against a cap of ${SPEC.perBody}`);
});

// --- the ferry ---------------------------------------------------------------

/** A terminal on the bay's north shore, with a road behind it. */
function withTerminal(def = "ferryTerminal") {
  const state = bay();
  const w = def === "freightPort" ? 3 : 2;
  const cells = [];
  for (let k = 0; k < w; k += 1) cells.push(at(4 + k, 3));
  apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns(cells) });
  const placed = apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x: 4, y: 4, def });
  return { state, placed };
}

test("a ferry runs from its terminal to the edge and back", () => {
  const { state, placed } = withTerminal();
  assert.equal(placed.result, "ok", "the terminal was refused");
  const model = createModel(state);
  const boats = createBoats(state, model);
  assert.deepEqual(boats.stats().routes, ["ferry"], "no ferry route from a terminal on a river");

  // Watched rather than sampled: the run is two ends and a dwell, and the
  // arithmetic that says WHEN it is at either is the thing under test.
  const seen = new Set();
  let onWater = 0;
  for (let i = 0; i < 30 * 400; i += 1) {
    boats.update(1 / 30);
    const ferry = boats.fleet().find((h) => h.kind === "ferry");
    if (!ferry) continue;
    onWater += model.water.isWater(at(ferry.x | 0, ferry.z | 0)) ? 1 : 0;
    // The route's landward end is the first water tile beside the footprint —
    // (3.5, 6.5) here, not the building's own x, because a terminal stands ON
    // the shore and its ferry waits off it.
    if (ferry.x < 1.5) seen.add("edge");
    if (ferry.x > 3 && ferry.z < 7) seen.add("terminal");
  }
  assert.ok(seen.has("edge"), "the ferry never reached the edge of the region");
  assert.ok(seen.has("terminal"), "the ferry never came back to its terminal");
  assert.ok(onWater > 30 * 300, `the ferry spent ${onWater} of its steps on water`);
});

test("a freight port sends a cargo ship, and it is slower", () => {
  const { state } = withTerminal("freightPort");
  const boats = createBoats(state, createModel(state));
  assert.deepEqual(boats.stats().routes, ["cargo"]);
  assert.ok(SPEC.cargoSpeed < SPEC.ferrySpeed, "a cargo ship is not slower than a ferry");
});

test("a terminal behind a headland still gets a vessel — it goes round", () => {
  // The route is a walk over the WATER, not a straight line. A straight line
  // refused any terminal whose crossing met land, which sounds principled and
  // is a limitation nobody asked for: a real ferry follows the channel. It
  // also made the freight port's own gate picture impossible, because the only
  // 3×2 berth seed 1003 offers has one tile of water at its corner.
  const state = bay();
  // On the bay's SOUTH shore, east of the headland: the water is rows 6–23, so
  // a 2×2 at row 24 has the bank in its ring and its road behind it at 26.
  const cells = [at(18, 26), at(19, 26)];
  apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns(cells) });
  const placed = apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x: 18, y: 24, def: "ferryTerminal" });
  assert.equal(placed.result, "ok", "the fixture could not place the terminal, so this proves nothing");

  const model = createModel(state);
  const boats = createBoats(state, model);
  assert.deepEqual(boats.stats().routes, ["ferry"], "a terminal east of the headland got no ferry");

  // And it stays on the water the whole way round, which is the point.
  let steps = 0;
  for (let i = 0; i < 30 * 300; i += 1) {
    boats.update(1 / 30);
    if (i % 13 !== 0) continue;
    const ferry = boats.fleet().find((h) => h.kind === "ferry");
    if (!ferry) continue;
    assert.ok(model.water.isWater(at(ferry.x | 0, ferry.z | 0)),
      `the ferry is on land at ${ferry.x.toFixed(2)}, ${ferry.z.toFixed(2)}`);
    steps += 1;
  }
  assert.ok(steps > 500, `only ${steps} positions were checked`);
});

// --- the moorings ------------------------------------------------------------

test("a marina moors boats, and they do not move", () => {
  const state = bay();
  const cells = [at(4, 3), at(5, 3)];
  apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns(cells) });
  apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x: 4, y: 4, def: "marina" });
  const model = createModel(state);
  const boats = createBoats(state, model);
  assert.ok(boats.stats().moored > 0, "a marina with no boats at it");

  const before = boats.fleet().filter((h) => h.kind === "moored").map((h) => `${h.x},${h.z}`);
  run(boats, 120);
  const after = boats.fleet().filter((h) => h.kind === "moored").map((h) => `${h.x},${h.z}`);
  assert.deepEqual(after, before, "a moored boat sailed away");
  for (const m of boats.fleet()) {
    if (m.kind !== "moored") continue;
    assert.ok(model.water.isWater(at(m.x | 0, m.z | 0)), "a moored boat is on the car park");
  }
});

// --- the rules it has to keep ------------------------------------------------

test("life: false leaves every boat where it is", () => {
  const state = bay();
  const boats = createBoats(state, createModel(state), { life: false });
  const before = boats.fleet().map((h) => `${h.x.toFixed(4)},${h.z.toFixed(4)}`);
  run(boats, 60);
  assert.deepEqual(boats.fleet().map((h) => `${h.x.toFixed(4)},${h.z.toFixed(4)}`), before);

  const moving = createBoats(state, createModel(state));
  run(moving, 60);
  assert.notDeepEqual(moving.fleet().map((h) => `${h.x.toFixed(4)},${h.z.toFixed(4)}`), before,
    "the unfrozen boats did not move either, so this proves nothing");
});

test("the same seconds in different steps put a boat in the same place", () => {
  const state = bay();
  const coarse = createBoats(state, createModel(state));
  const fine = createBoats(state, createModel(state));
  for (let i = 0; i < 10; i += 1) coarse.update(1 / 10);
  run(fine, 1);
  const a = coarse.fleet().filter((h) => h.kind === "sailing");
  const b = fine.fleet().filter((h) => h.kind === "sailing");
  assert.equal(a.length, b.length);
  for (let k = 0; k < a.length; k += 1) {
    assert.ok(Math.abs(a[k].x - b[k].x) < 1e-9 && Math.abs(a[k].z - b[k].z) < 1e-9,
      `boat ${k} is at ${a[k].x},${a[k].z} in one and ${b[k].x},${b[k].z} in the other`);
  }
});

test("the boats ask nobody for the time", () => {
  const source = readFileSync(join(repoRoot, "client", "life", "boats.js"), "utf8");
  for (const pattern of [/Date\.now/, /performance\.now/, /new Date/, /requestAnimationFrame/]) {
    assert.equal(pattern.test(source), false, `client/life/boats.js uses ${pattern}`);
  }
});

// --- under the bridge (slice S13, A84) ----------------------------------------

test("the tallest vessel in the city fits under a bridge deck", () => {
  // S13's deck is a number chosen for this: `road.deckClearance` is the deck's
  // surface over the water and `road.deckDepth` the girder under it, so what
  // passes beneath has the difference. The hulls were literals inside
  // `instances.js` until this slice — a three module, which node cannot read,
  // so the clearance and the thing it is a clearance FOR could drift apart
  // with nothing to notice.
  const { deckClearance, deckDepth } = DEFAULTS.road;
  const free = deckClearance - deckDepth;
  const tallest = Math.max(DEFAULTS.boat.ferryH, DEFAULTS.boat.hullH);
  assert.ok(free > tallest,
    `${free} m under the girder and the tallest hull is ${tallest} m`);
});

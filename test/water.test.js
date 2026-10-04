// Water (slice E8; spec §5.5, Q58).
//
// Water has never been built. A water tile was a terrain COLOUR whose height
// was clamped to a single global `waterLevel`, so at street level a lake was a
// flat blue floor the walker strolled across, and a river running down a valley
// was drawn as a plateau at the height of its highest tile.
//
// Two things follow from looking at that rather than at the colour:
//
//   - **The level is per body, not per map.** `waterLevel` was the maximum land
//     height of any water tile anywhere, which on the `rolling` fixture is 47.5 m
//     while the same river's lowest tile is at 14 m. One number cannot be the
//     surface of both.
//   - **The bed has to drop.** A surface and a floor at the same height is not
//     water, it is a blue field. The shoreline is where the bed comes up
//     through the surface, which is geometry and not a texture.
//
// All of it is arithmetic over the tile layers, so all of it is here.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt } from "../shared/grid.js";
import { NET_PRESENT, NET_AVENUE } from "../client/constants-mirror.js";
import { DEFAULTS, setConfig } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { createCollision } from "../client/world/collision.js";
import { deriveWater } from "../client/world/water.js";

setConfig(DEFAULTS);
const T = DEFAULTS.tileM;
const R = DEFAULTS.reliefM;
const WATER = 3;
const SHALLOW = 4;
const GRASS = 0;

function blank(size = 12) {
  const state = createState(defaultOptions({ width: size, height: size, seed: 7 }));
  state.tiles.terrain.fill(GRASS);
  state.tiles.elevation.fill(40);
  return state;
}

/** A square of water, all at one elevation. */
function pond(state, x0, y0, x1, y1, elevation = 30) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = tileAt(state.width, x, y);
      state.tiles.terrain[i] = WATER;
      state.tiles.elevation[i] = elevation;
    }
  }
}

const waterOf = (state) => deriveWater(state);

// --- the surface --------------------------------------------------------------

test("a water tile knows its own surface, and it is the land there", () => {
  const state = blank();
  pond(state, 4, 4, 7, 7, 30);
  const w = waterOf(state);
  assert.equal(w.levelOf(tileAt(state.width, 5, 5)), 30 * R);
});

test("a lake is level, whatever the land around it does", () => {
  const state = blank();
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) state.tiles.elevation[tileAt(state.width, x, y)] = 40 + x * 3;
  }
  pond(state, 4, 4, 7, 7, 30);
  const w = waterOf(state);
  const levels = new Set();
  for (let y = 4; y <= 7; y += 1) for (let x = 4; x <= 7; x += 1) levels.add(w.levelOf(tileAt(state.width, x, y)));
  assert.equal(levels.size, 1, `a four-by-four lake has ${levels.size} surfaces`);
});

test("a river running downhill steps down with its valley", () => {
  // The bug this replaces: one global `waterLevel` is the maximum over every
  // water tile on the map, so a river descending 30 m was a plateau at the top
  // of it for half its length.
  const state = blank(16);
  for (let y = 2; y < 14; y += 1) {
    const i = tileAt(state.width, 8, y);
    state.tiles.terrain[i] = WATER;
    state.tiles.elevation[i] = 60 - y * 3;
  }
  const w = waterOf(state);
  const top = w.levelOf(tileAt(state.width, 8, 3));
  const bottom = w.levelOf(tileAt(state.width, 8, 13));
  assert.ok(top > bottom + 5, `the river falls ${(top - bottom).toFixed(1)} m`);
});

test("dry land has no surface at all", () => {
  const state = blank();
  pond(state, 4, 4, 7, 7);
  const w = waterOf(state);
  assert.equal(w.isWater(tileAt(state.width, 1, 1)), false);
  assert.equal(w.levelOf(tileAt(state.width, 1, 1)), undefined);
});

test("shallow counts as water", () => {
  const state = blank();
  const i = tileAt(state.width, 5, 5);
  state.tiles.terrain[i] = SHALLOW;
  const w = waterOf(state);
  assert.equal(w.isWater(i), true);
});

// --- the bed --------------------------------------------------------------------

test("open water is deep and the shore is not", () => {
  // A beach, not a step: a tile touching land is at the surface and the bed
  // drops away over `water.shelf` tiles. Otherwise the shoreline is a wall the
  // height of the water.
  const state = blank(16);
  pond(state, 4, 4, 11, 11, 30);
  const w = waterOf(state);
  assert.equal(w.depthOf(tileAt(state.width, 4, 4)), 0, "the shore is already deep");
  assert.ok(w.depthOf(tileAt(state.width, 7, 7)) > DEFAULTS.water.depth - 1e-9,
    "the middle of a lake is not deep");
});

test("depth never exceeds what the data asks for", () => {
  const state = blank(24);
  pond(state, 2, 2, 21, 21, 30);
  const w = waterOf(state);
  for (const tile of w.tiles) {
    assert.ok(w.depthOf(tile) <= DEFAULTS.water.depth + 1e-9, `${w.depthOf(tile)} m`);
    assert.ok(w.depthOf(tile) >= 0);
  }
});

test("a one-tile puddle is all shore, so nothing falls into it", () => {
  const state = blank();
  pond(state, 5, 5, 5, 5, 30);
  const w = waterOf(state);
  assert.equal(w.depthOf(tileAt(state.width, 5, 5)), 0);
});

// --- what the rest of the renderer sees -------------------------------------------

test("heightAt over open water is the BED, not the surface", () => {
  const state = blank(16);
  pond(state, 4, 4, 11, 11, 30);
  const m = createModel(state);
  const deep = m.heightAt(7.5 * T, 7.5 * T);
  assert.ok(deep < 30 * R - 1, `the bed is at ${deep} and the surface at ${30 * R}`);
});

test("surfaceAt on water is the water, at the water's own level (E8)", () => {
  const state = blank(16);
  pond(state, 4, 4, 11, 11, 30);
  const m = createModel(state);
  const at = m.surfaceAt(7.5 * T, 7.5 * T);
  assert.equal(at.kind, "water");
  assert.ok(Math.abs(at.y - 30 * R) < 1e-9, `${at.y} against ${30 * R}`);
});

test("the shoreline is where the bed comes up through the surface", () => {
  const state = blank(16);
  pond(state, 4, 4, 11, 11, 30);
  const m = createModel(state);
  const level = m.waterLevelAt(7.5 * T, 7.5 * T);
  // Walking out from the middle of the lake, the ground rises and crosses the
  // surface exactly once.
  let crossings = 0;
  let under = m.heightAt(7.5 * T, 7.5 * T) < level;
  for (let x = 7.5; x <= 14; x += 0.25) {
    const nowUnder = m.heightAt(x * T, 7.5 * T) < level;
    if (nowUnder !== under) crossings += 1;
    under = nowUnder;
  }
  assert.equal(crossings, 1, `the ground crosses the water ${crossings} times`);
});

// --- the bridge (slice S13, A84) ----------------------------------------------------

/** A road running the full width of the map across a pond, with its adjacency
 * mask, which is what `deriveCorridors` reads. */
function crossing(state, row, kind = NET_PRESENT) {
  const road = state.tiles.road;
  for (let x = 0; x < state.width; x += 1) road[tileAt(state.width, x, row)] = kind;
  for (let x = 0; x < state.width; x += 1) {
    const mask = adjacencyMask(state.width, state.height, x, row, (i) => (road[i] & NET_PRESENT) !== 0);
    road[tileAt(state.width, x, row)] = kind | mask;
  }
}

test("a road over water is a DECK above the surface, not a causeway in it", () => {
  // Q58 accepted a causeway and A84 overruled it: the road clamped to the water
  // level, which made the bank a 0.7 m step the walker could not climb and put
  // the carriageway at the waterline. The deck rides `road.deckClearance` over
  // it so a boat passes under (T4b).
  const state = blank(16);
  pond(state, 4, 4, 11, 11, 30);
  crossing(state, 7);
  const m = createModel(state);
  const level = m.waterLevelAt(7.5 * T, 7.5 * T);
  const deck = m.heightAt(7.5 * T, 7.5 * T);
  const clear = DEFAULTS.road.deckClearance;
  assert.ok(deck > level + clear - 0.5,
    `mid-channel the deck is ${(deck - level).toFixed(2)} m over the water, asked for ${clear}`);
  // And a step to the side of it is still the lake.
  assert.ok(m.heightAt(7.5 * T, 5.5 * T) < level - 0.5, "the whole lake came up with the road");
});

test("the water under a bridge is still water, and the ground under it still the bed", () => {
  // The deck is the ROAD's height. The terrain mesh, the overlay quads and the
  // camera's orbit read `cornerHeightAt`, and if that followed the deck the
  // river would be a four-metre earth embankment with the water inside it.
  const state = blank(16);
  pond(state, 4, 4, 11, 11, 30);
  // An AVENUE, because a street's half-width plus its blend is eight metres and
  // the nearest mesh corner is ten: the corridor never reaches a corner of the
  // terrain mesh at all, so a street crossing cannot tell the two answers
  // apart. The seven-metre half of an avenue can.
  const bare = createModel(state);
  const bed = [];
  for (let j = 5; j <= 11; j += 1) for (let i = 5; i <= 11; i += 1) bed.push(bare.cornerHeightAt(i, j));
  crossing(state, 7, NET_PRESENT | NET_AVENUE);
  const m = createModel(state);
  const level = m.waterLevelAt(7.5 * T, 7.5 * T);
  // The invariant, rather than a threshold: the terrain under a bridge is the
  // terrain of the same channel with no bridge over it. A corridor's blend
  // reaches ten metres and an avenue's mesh corners are inside that, so with
  // the deck in the corner table every one of these lifts toward it.
  const now = [];
  for (let j = 5; j <= 11; j += 1) for (let i = 5; i <= 11; i += 1) now.push(m.cornerHeightAt(i, j));
  const worst = Math.max(...now.map((h, k) => Math.abs(h - bed[k])));
  assert.ok(worst < 1e-9, `the bridge moved the channel bed by ${worst.toFixed(3)} m`);
  assert.ok(m.cornerHeightAt(7, 7) < level - 0.5,
    `the ground under the deck is at ${m.cornerHeightAt(7, 7).toFixed(2)}, the surface at ${level}`);
  assert.equal(m.surfaceAt(7.5 * T, 7.5 * T).kind, "road", "the deck is what is underfoot on the bridge");
  assert.ok(m.surfaceAt(7.5 * T, 5.5 * T).kind === "water", "beside the bridge is open water");
});

test("the walker crosses the bridge instead of drowning at the bank (S13)", () => {
  // The 939 refused steps `walkthrough` counted at crossings were all one
  // shape: `floorAt` returns undefined over water deeper than `water.wade`, and
  // the causeway's own bank was a step taller than `stepUp` on top of that.
  const state = blank(16);
  pond(state, 4, 4, 11, 11, 30);
  crossing(state, 7);
  const m = createModel(state);
  const col = createCollision(m);
  let foot = m.surfaceAt(0.5 * T, 7.5 * T).y;
  let blocked = 0;
  let drowned = 0;
  for (let x = 0.5; x < 15.5; x += 0.25) {
    const y = col.floorAt(x * T, 7.5 * T, foot);
    if (y === undefined) {
      const kind = m.surfaceAt(x * T, 7.5 * T).kind;
      if (kind === "water") drowned += 1; else blocked += 1;
      continue;
    }
    foot = y;
  }
  assert.equal(drowned, 0, `${drowned} steps along the crossing are open water`);
  assert.equal(blocked, 0, `${blocked} steps along the crossing are too tall to climb`);
});

// --- which chunks need a plane --------------------------------------------------------

test("only the chunks with water in them get a surface", () => {
  const state = blank(40);
  pond(state, 2, 2, 5, 5, 30);
  const w = waterOf(state);
  const chunks = w.chunksWithWater(16);
  assert.deepEqual([...chunks], ["0,0"], `${[...chunks].join(" ")}`);
});

test("a map with no water asks for no surfaces at all", () => {
  const w = waterOf(blank());
  assert.equal(w.tiles.length, 0);
  assert.equal(w.chunksWithWater(16).size, 0);
});

// --- determinism ------------------------------------------------------------------------

test("the water is a function of the state and nothing else", () => {
  const state = blank(16);
  pond(state, 4, 4, 11, 11, 30);
  const a = waterOf(state);
  const b = waterOf(state);
  assert.deepEqual(a.tiles, b.tiles);
  assert.deepEqual(a.tiles.map((t) => [a.levelOf(t), a.depthOf(t)]),
    b.tiles.map((t) => [b.levelOf(t), b.depthOf(t)]));
});

// --- the trough (slice S4, A50) --------------------------------------------------------

/** A real generated region, which is where the defect lives: `pond()` digs its
 * water below the land around it by construction, and a generated map does not.
 * On five seeds about half of every shore pair had the water at or ABOVE the dry
 * land beside it — a river painted across a hillside. */
function region(seed = 1003, size = 48) {
  const world = generateWorld(defaultOptions({ seed, width: size, height: size, seats: 1, waterStyle: "river" }));
  assert.ok(world.ok, `seed ${seed} did not generate`);
  return world.state;
}

const dryNeighbours = (state, tile) => {
  const x = tile % state.width;
  const y = (tile - x) / state.width;
  const out = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
    const j = tileAt(state.width, nx, ny);
    const t = state.tiles.terrain[j];
    if (t !== WATER && t !== SHALLOW) out.push(j);
  }
  return out;
};

test("water never sits above the bank beside it", () => {
  // The surface is the land the water stands on — and where the land beside it
  // is LOWER, that surface is a river perched on a hillside. It is capped at
  // the lowest dry neighbour, so the bank always rises out of the water.
  for (const seed of [1003, 2026, 77]) {
    const state = region(seed);
    const w = waterOf(state);
    let worst = 0;
    for (const tile of w.tiles) {
      for (const dry of dryNeighbours(state, tile)) {
        const bank = state.tiles.elevation[dry] * R;
        worst = Math.max(worst, w.levelOf(tile) - bank);
      }
    }
    assert.ok(worst <= 1e-9, `seed ${seed}: the water stands ${worst.toFixed(2)} m above its bank`);
  }
});

test("the bed under a river is below both banks", () => {
  // S4's own test. A channel, not a blue ribbon at land height: measured at the
  // middle of every water tile, the bed is under the land on both sides.
  for (const seed of [1003, 2026, 77]) {
    const state = region(seed);
    const m = createModel(state);
    const w = m.water;
    let shallowest = Infinity;
    let counted = 0;
    for (const tile of w.tiles) {
      const banks = dryNeighbours(state, tile);
      if (banks.length === 0) continue;
      const x = tile % state.width;
      const y = (tile - x) / state.width;
      const bed = m.heightAt((x + 0.5) * T, (y + 0.5) * T);
      const lowestBank = Math.min(...banks.map((b) => state.tiles.elevation[b] * R));
      shallowest = Math.min(shallowest, lowestBank - bed);
      counted += 1;
    }
    assert.ok(counted > 20, `seed ${seed}: only ${counted} water tiles have a bank`);
    assert.ok(shallowest > 0, `seed ${seed}: a bed sits ${(-shallowest).toFixed(2)} m ABOVE its bank`);
  }
});

test("a river two tiles wide still has a channel", () => {
  // The defect the per-tile depth could not see: every tile of a narrow river
  // touches land, `depthOf` is 0 at both, and the river is a flat blue strip at
  // the height of its banks. Depth is a field now — how far from dry land the
  // POINT is — so the middle of the channel is deep and the shoreline is not.
  const state = blank(16);
  for (let y = 0; y < 16; y += 1) {
    for (const x of [7, 8]) {
      const i = tileAt(state.width, x, y);
      state.tiles.terrain[i] = WATER;
      state.tiles.elevation[i] = 30;
    }
  }
  const w = waterOf(state);
  const mid = w.depthAt(8 * T, 8 * T);
  const edge = w.depthAt(7.02 * T, 8 * T);
  assert.ok(mid > DEFAULTS.water.depth * 0.4, `the middle of the channel is ${mid.toFixed(2)} m deep`);
  assert.ok(edge < 0.2, `the shoreline is ${edge.toFixed(2)} m deep, which is a step and not a beach`);
  assert.equal(w.depthOf(tileAt(state.width, 7, 8)), 0, "the per-tile depth is unchanged (E8, Q58)");
});

test("the surface is one sheet: neighbouring tiles share a corner height", () => {
  // The amendment (2026-09-13): the quad-per-tile surface showed its tiles as
  // seams and a cross-hatch, because each quad sat at its own level. The corners
  // are shared now, so a lake is one sheet.
  const state = blank(16);
  pond(state, 4, 4, 11, 11, 30);
  const w = waterOf(state);
  const level = 30 * R;
  for (let cy = 5; cy <= 11; cy += 1) {
    for (let cx = 5; cx <= 11; cx += 1) {
      assert.ok(Math.abs(w.cornerLevelAt(cx, cy) - level) < 1e-9,
        `corner ${cx},${cy} is at ${w.cornerLevelAt(cx, cy)} against ${level}`);
    }
  }
});

test("a river still steps down its valley", () => {
  // And sharing corners must not flatten it: E8's finding was a river drawn as a
  // plateau at the height of its highest tile.
  const state = blank(16);
  for (let y = 0; y < 16; y += 1) {
    for (const x of [7, 8]) {
      const i = tileAt(state.width, x, y);
      state.tiles.terrain[i] = WATER;
      state.tiles.elevation[i] = 40 - y;
    }
  }
  const w = waterOf(state);
  const top = w.cornerLevelAt(8, 1);
  const bottom = w.cornerLevelAt(8, 15);
  assert.ok(top - bottom > 5, `the river falls ${(top - bottom).toFixed(2)} m from end to end`);
  // Level ACROSS the channel at any one point, which is what water does.
  assert.equal(w.cornerLevelAt(7, 8), w.cornerLevelAt(9, 8));
});

// --- the bank (slice S12) ------------------------------------------------------------

/** The steepest step the ground takes walking INLAND out of the water, in rise
 * over run — counting only the dry part of the walk.
 *
 * The bed below the waterline belongs to S4's shelf and the walker never
 * stands on it; what S12 is about is the part a person walks, from the
 * waterline up onto the land. */
function shoreGrade(model, state, tile, step = 2) {
  const x = tile % state.width;
  const y = (tile - x) / state.width;
  const level = model.water.levelOf(tile);
  let worst = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
    const t = state.tiles.terrain[tileAt(state.width, nx, ny)];
    if (t === WATER || t === SHALLOW) continue;
    const cx = (x + 0.5) * T;
    const cz = (y + 0.5) * T;
    let prev;
    let dryFrom = -1;
    for (let d = 0; d <= 4 * T; d += step) {
      const h = model.heightAt(cx + dx * d, cz + dy * d);
      if (h >= level) {
        if (dryFrom < 0) dryFrom = d;
        // The first TILE of dry ground, which is where the quay was: beyond it
        // the land is the land, and a hill inland is not a shore.
        if (prev !== undefined && d - dryFrom <= T) worst = Math.max(worst, Math.abs(h - prev) / step);
      }
      prev = h >= level ? h : undefined;
    }
  }
  return worst;
}

/** Every shore tile of a generated region, with its steepest dry climb. */
function shoreGrades(seed) {
  const state = region(seed);
  const m = createModel(state);
  const grades = [];
  for (const tile of m.water.tiles) {
    if (dryNeighbours(state, tile).length === 0) continue;
    grades.push([tile, shoreGrade(m, state, tile)]);
  }
  return { state, model: m, grades };
}

test("the shore is a bank you can walk up, not a quay wall (S12)", () => {
  // S4 capped the water at its bank and cut a channel under it, and left the
  // cut ONE tile wide: where the land stands high the shore fell 7.44 m over
  // 20 m — 37%, a quay wall in `smoke-S4-shore.png` and a cliff on foot.
  //
  // The criterion is MEASURED rather than guessed, because "no shore steeper
  // than `road.maxGrade`" is not a thing any cut can deliver: a hill that meets
  // water is a sea cliff, and flattening it is flattening the map. Over three
  // generated regions the ladder reads, as the share of shores climbing more
  // than 15% in their first tile:
  //
  //   bank 0   41%  50%  48%      (the quay: p95 126–171%)
  //   bank 2   14%  11%  22%
  //   bank 3    7%   1%  14%      <- the knee, and the shipped number
  //   bank 5    7%   1%  14%      no better, and it cuts twice as much land
  //
  // So: a fifth of the shores of any map may still be cliffs, and the MEDIAN
  // shore is a bank — which is the sentence S12 is about.
  for (const seed of [1003, 2026, 77]) {
    const { grades } = shoreGrades(seed);
    assert.ok(grades.length > 20, `seed ${seed}: only ${grades.length} shore tiles to measure`);
    const steep = grades.filter(([, g]) => g > DEFAULTS.road.maxGrade).length;
    const sorted = grades.map(([, g]) => g).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    assert.ok(median <= DEFAULTS.road.maxGrade,
      `seed ${seed}: the median shore climbs ${(median * 100).toFixed(1)}%`);
    assert.ok(steep / grades.length <= 0.2,
      `seed ${seed}: ${steep} of ${grades.length} shores are steeper than`
      + ` ${(DEFAULTS.road.maxGrade * 100).toFixed(0)}%`);
  }
});

test("cutting the bank only ever cuts, and never moves the water (S12)", () => {
  // Measured against the same region with the cut turned OFF (`water.bank: 0`),
  // because a tile's own elevation is not the baseline: `landAt` is bilinear
  // over corners, so the middle of a tile beside a higher one is already above
  // its own height. Nothing on the dry side may come UP — a shore that raises
  // the land is a dam — and the surface is a separate thing from the ground
  // under it, which is what keeps the sheet, the wet sand and the reeds where
  // they were.
  const state = region(1003);
  const cut = createModel(state);
  setConfig({ ...DEFAULTS, water: { ...DEFAULTS.water, bank: 0 } });
  const quay = createModel(state);
  setConfig(DEFAULTS);
  let raised = 0;
  let lowered = 0;
  for (const tile of cut.water.tiles) {
    assert.equal(cut.water.levelOf(tile), quay.water.levelOf(tile), "the surface moved");
    for (const dry of dryNeighbours(state, tile)) {
      const dx = dry % state.width;
      const dy = (dry - dx) / state.width;
      const before = quay.heightAt((dx + 0.5) * T, (dy + 0.5) * T);
      const after = cut.heightAt((dx + 0.5) * T, (dy + 0.5) * T);
      if (after > before + 1e-6) raised += 1;
      if (after < before - 1e-6) lowered += 1;
    }
  }
  assert.equal(raised, 0, `${raised} bank tiles were raised by the cut`);
  assert.ok(lowered > 10, `the cut lowered only ${lowered} bank tiles — it is not doing anything`);
});

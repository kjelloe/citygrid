// Damage you can see (slice B1b; the renderer half of B1).
//
// Two states the engine makes constantly and the world has never shown: a
// building on fire, and the burnt ground it leaves. At city zoom a ruin was one
// flat grey slab a tile; at street level it was nothing at all, and a building
// on fire looked exactly like its neighbours.
//
// Both are read from the TILE flags. A building record carries a `flags` field —
// `development.js` creates it as 0, `state.js` hashes it — and **nothing in the
// engine has ever written to it**, so `instances.js`'s burning test has been
// false since S6 and the smoke that spec §9.4b describes has never once drawn.
// This lane may not touch `engine/` (ruling 037), so the renderer reads the
// layer that does carry the truth.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { tileAt } from "../shared/grid.js";
import { FLAG_BURNING, FLAG_RUINED } from "../client/constants-mirror.js";
import { DEFAULTS, setConfig } from "../client/world/config.js";
import {
  isBurning, ruinPlots, ruinWalls, rubbleOf, emberTint, charTint, RUIN, EMBER, CHAR,
} from "../client/world/damage.js";

setConfig(DEFAULTS);

function blank(size = 16) {
  const state = createState(defaultOptions({ width: size, height: size, seed: 3 }));
  state.tiles.terrain.fill(0);
  state.tiles.elevation.fill(40);
  return state;
}

const burn = (state, x, y) => { state.tiles.flags[tileAt(state.width, x, y)] |= FLAG_BURNING; };
const ruin = (state, x, y) => { state.tiles.flags[tileAt(state.width, x, y)] |= FLAG_RUINED; };
const building = (over = {}) => ({ id: 7, def: "res", zone: 1, x: 4, y: 4, w: 2, h: 2, level: 2, flags: 0, ...over });

test("a building is burning when its own ground is, whatever its record says", () => {
  // The record's `flags` is 0 for every building the engine has ever made.
  const state = blank();
  const b = building();
  assert.equal(isBurning(state, b), false);
  burn(state, 5, 5);
  assert.equal(isBurning(state, b), true, "a burning tile under the building did not reach it");
  assert.equal(b.flags, 0, "the fixture leans on the record's flags, which are always 0");
});

test("one tile of a big building alight is the building alight", () => {
  const state = blank();
  const b = building({ x: 2, y: 2, w: 3, h: 3 });
  burn(state, 4, 4);
  assert.equal(isBurning(state, b), true);
});

test("burnt ground groups into plots, not tiles", () => {
  // A ruin is what is left of a building, so the shape to draw is the footprint
  // it stood on — four tiles of one house is one ruin, not four slabs.
  const state = blank();
  for (const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5]]) ruin(state, x, y);
  ruin(state, 10, 10);
  const plots = ruinPlots(state, 0, 0, 16, 16);
  assert.equal(plots.length, 2, `${plots.length} plots from two ruins`);
  const big = plots.find((p) => p.tiles.length === 4);
  assert.ok(big, "the four-tile ruin did not come back as one plot");
  assert.deepEqual([big.x0, big.y0, big.x1, big.y1], [4, 4, 6, 6]);
  assert.equal(plots.find((p) => p.tiles.length === 1).x0, 10);
});

test("only the ruins in the window asked for", () => {
  const state = blank();
  ruin(state, 1, 1);
  ruin(state, 12, 12);
  assert.equal(ruinPlots(state, 0, 0, 8, 8).length, 1);
  assert.equal(ruinPlots(state, 8, 8, 16, 16).length, 1);
});

test("a ruin is walls around its own outline, one storey and no roof", () => {
  const state = blank();
  for (const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5]]) ruin(state, x, y);
  const [plot] = ruinPlots(state, 0, 0, 16, 16);
  const walls = ruinWalls(plot);
  assert.ok(walls.length >= 4, `${walls.length} wall segments around a square ruin`);
  for (const w of walls) {
    assert.ok(w.height > 0 && w.height <= RUIN.wallM,
      `a wall stands ${w.height} m, against one storey of ${RUIN.wallM}`);
  }
  // Every segment is on the plot's edge: nothing crosses the middle of it.
  for (const w of walls) {
    const onEdge = w.x0 === plot.x0 || w.x1 === plot.x1 || w.y0 === plot.y0 || w.y1 === plot.y1;
    assert.ok(onEdge, `a wall runs through the middle of the plot (${w.x0},${w.y0})-(${w.x1},${w.y1})`);
  }
});

test("a ruin's walls are broken, and broken the same way every time", () => {
  // A complete box is a building with its roof off; a ruin is a wall that has
  // fallen in places. Deterministic, because two frames of one city must draw
  // the same ruin (ruling 037's re-derivable half).
  const state = blank();
  for (const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5]]) ruin(state, x, y);
  const [plot] = ruinPlots(state, 0, 0, 16, 16);
  const a = ruinWalls(plot);
  const b = ruinWalls(plot);
  assert.deepEqual(a, b, "two derivations of one ruin differ");
  const heights = new Set(a.map((w) => Math.round(w.height * 100)));
  assert.ok(heights.size > 1, "every wall of the ruin is exactly the same height");
});

test("rubble sits inside the plot, and there is some", () => {
  const state = blank();
  for (const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5]]) ruin(state, x, y);
  const [plot] = ruinPlots(state, 0, 0, 16, 16);
  const rubble = rubbleOf(plot);
  assert.ok(rubble.length >= plot.tiles.length, `${rubble.length} pieces of rubble on four tiles`);
  for (const r of rubble) {
    assert.ok(r.x >= plot.x0 && r.x <= plot.x1 && r.y >= plot.y0 && r.y <= plot.y1,
      `rubble at ${r.x},${r.y} is outside the plot`);
    assert.ok(r.h > 0 && r.h < RUIN.wallM, `a piece of rubble stands ${r.h} m`);
  }
  assert.deepEqual(rubbleOf(plot), rubble, "two derivations of one ruin's rubble differ");
});

test("a burning wall keeps its own colour and moves toward ember", () => {
  // A burning brick house is still a brick house, and a state is not a style:
  // both renderers read these, so a ruin is the same ruin in all three styles.
  const brick = 0xb4715a;
  const slate = 0x6d7b86;
  assert.notEqual(emberTint(brick), emberTint(slate), "every burning building is the same colour");
  assert.notEqual(emberTint(brick), EMBER, "the wall was replaced by the fire, not lit by it");
  const r = (c) => (c >> 16) & 255;
  assert.ok(r(emberTint(slate)) > r(slate), "the ember made a cool wall no warmer");
});

test("a charred wall is darker than the wall it was", () => {
  const brick = 0xb4715a;
  const sum = (c) => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
  assert.ok(sum(charTint(brick)) < sum(brick) * 0.6, "the char barely darkened it");
  assert.notEqual(charTint(brick), CHAR, "every ruin is the same flat colour");
});


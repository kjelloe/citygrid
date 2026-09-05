// The ground's colour (slice V3; specs/engine/05-ground-and-streets.md §5.1).
//
// The terrain is one flat colour per tile, deliberately — "a city grid wants to
// read as tiles". At the zoom the reference shots use, that reads as a
// checkerboard of green patches, and it is the first thing the eye lands on.
//
// The rule is not "blend everything": blending the built land would take the
// grid away, and the grid is what makes a city legible. Natural ground blends;
// anything a player has put there does not. That distinction is the whole
// slice, and it is arithmetic, so it is tested here rather than looked at.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt } from "../shared/grid.js";
import { NET_PRESENT } from "../client/constants-mirror.js";
import { DEFAULTS, getConfig, setConfig } from "../client/world/config.js";
import { createGroundColour } from "../client/world/ground-colour.js";
import { PALETTES } from "../client/render/palettes.js";

const PALETTE = PALETTES.plain;
const GRASS = 0;
const FOREST = 2;

function blank(size = 16) {
  const state = createState(defaultOptions({ width: size, height: size, seed: 7 }));
  state.tiles.terrain.fill(GRASS);
  state.tiles.elevation.fill(60);
  return state;
}

function pave(state, ...groups) {
  const road = state.tiles.road;
  const tiles = groups.flat();
  for (const [x, y] of tiles) road[tileAt(state.width, x, y)] = NET_PRESENT;
  for (const [x, y] of tiles) {
    const mask = adjacencyMask(state.width, state.height, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
    road[tileAt(state.width, x, y)] = NET_PRESENT | mask;
  }
}

const row = (y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, k) => [x0 + k, y]);

/** The colour source for a state, with the config the test wants. */
function colours(state, overrides = {}) {
  setConfig({ ...DEFAULTS, ground: { ...DEFAULTS.ground, ...overrides } });
  return createGroundColour(state, PALETTE);
}

const rgb = (hex) => [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
const near = (a, b, slack = 1) => rgb(a).every((v, i) => Math.abs(v - rgb(b)[i]) <= slack);

test.afterEach(() => setConfig(DEFAULTS));

// --- the knob ----------------------------------------------------------------

test("blend 0 reproduces the flat picture exactly", () => {
  // The escape hatch, and the thing that makes the change reviewable: one knob
  // at zero and the ground is what it was.
  const state = blank();
  state.tiles.terrain[tileAt(16, 5, 5)] = FOREST;
  const flat = colours(state, { blend: 0, mottle: 0, farTone: 0 });
  for (let y = 3; y < 8; y += 1) {
    for (let x = 3; x < 8; x += 1) {
      const own = flat.tile(x, y);
      for (let c = 0; c < 4; c += 1) {
        assert.equal(flat.corner(x, y, c), own,
          `corner ${c} of ${x},${y} is not the tile's own colour`);
      }
    }
  }
});

// --- the blend ---------------------------------------------------------------

test("a corner between four natural tiles is their mean", () => {
  const state = blank();
  // One forest tile against three of grass: the shared corner is the average.
  state.tiles.terrain[tileAt(16, 5, 5)] = FOREST;
  const g = colours(state, { blend: 1, mottle: 0, farTone: 0 });
  // Corner 0 of (5,5) is shared by (4,4), (5,4), (4,5) and (5,5).
  const mean = [0, 1, 2].map((k) =>
    Math.round((rgb(g.tile(4, 4))[k] + rgb(g.tile(5, 4))[k] + rgb(g.tile(4, 5))[k] + rgb(g.tile(5, 5))[k]) / 4));
  assert.deepEqual(rgb(g.corner(5, 5, 0)), mean);
});

test("two tiles of the same terrain still meet in their own colour", () => {
  // The mean of four identical colours is that colour: an all-grass field must
  // not acquire a gradient out of nothing.
  const state = blank();
  const g = colours(state, { blend: 1, mottle: 0, farTone: 0 });
  for (let c = 0; c < 4; c += 1) assert.equal(g.corner(8, 8, c), g.tile(8, 8));
});

test("a corner touching built land keeps the tile's own colour", () => {
  // Otherwise the road bleeds into the verge and the grid stops reading, which
  // is the thing the flat-tile decision was protecting.
  const state = blank();
  pave(state, row(6, 2, 12));
  const g = colours(state, { blend: 1, mottle: 0, farTone: 0 });
  // The grass tile directly above the road: its two lower corners touch tarmac.
  const own = g.tile(6, 5);
  assert.equal(g.corner(6, 5, 2), own, "the corner below bled into the road");
  assert.equal(g.corner(6, 5, 3), own, "the corner below bled into the road");
  // And the road tile itself is flat on every corner.
  for (let c = 0; c < 4; c += 1) {
    assert.equal(g.corner(6, 6, c), g.tile(6, 6), `the road's corner ${c} is not tarmac`);
  }
});

test("zoned and built land is as flat as paved land", () => {
  const state = blank();
  state.tiles.zone[tileAt(16, 9, 9)] = 1;
  state.tiles.buildingId[tileAt(16, 11, 11)] = 7;
  const g = colours(state, { blend: 1, mottle: 0, farTone: 0 });
  for (const [x, y] of [[9, 9], [11, 11]]) {
    for (let c = 0; c < 4; c += 1) {
      assert.equal(g.corner(x, y, c), g.tile(x, y), `${x},${y} corner ${c} blended`);
    }
    // ...and so is its neighbour's corner that touches it.
    assert.equal(g.corner(x, y - 1, 2), g.tile(x, y - 1));
  }
});

// --- the two cheap signals ---------------------------------------------------

test("the mottle varies a field without changing what it is", () => {
  const state = blank();
  const g = colours(state, { blend: 0, mottle: 0.06, farTone: 0 });
  const flat = colours(state, { blend: 0, mottle: 0, farTone: 0 });
  const seen = new Set();
  let worst = 0;
  for (let y = 2; y < 14; y += 1) {
    for (let x = 2; x < 14; x += 1) {
      seen.add(g.tile(x, y));
      const a = rgb(g.tile(x, y));
      const b = rgb(flat.tile(x, y));
      worst = Math.max(worst, ...a.map((v, i) => Math.abs(v - b[i]) / Math.max(1, b[i])));
    }
  }
  assert.ok(seen.size > 20, `${seen.size} distinct shades over 144 tiles of one terrain`);
  assert.ok(worst <= 0.07, `a tile moved ${(worst * 100).toFixed(1)}% — the mottle is a texture, not a repaint`);
});

test("the mottle is a function of the tile, not of the call", () => {
  const state = blank();
  const g = colours(state, { blend: 1, mottle: 0.06, farTone: 0.12 });
  assert.equal(g.tile(7, 7), g.tile(7, 7));
  const again = colours(state, { blend: 1, mottle: 0.06, farTone: 0.12 });
  assert.equal(again.tile(7, 7), g.tile(7, 7), "two derivations of one city disagree");
});

test("open country away from a street is darker than the verge beside it", () => {
  // Higashiyama's signal: the city has a halo of tended ground and the country
  // beyond it is not. Cheap, and it does most of the work of making a city look
  // like it sits IN something.
  const state = blank(24);
  pave(state, row(6, 2, 20));
  const g = colours(state, { blend: 1, mottle: 0, farTone: 0.12, urbanReach: 40 });
  const beside = rgb(g.tile(10, 5));
  const far = rgb(g.tile(10, 20));
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  assert.ok(lum(far) < lum(beside), `far ${lum(far).toFixed(1)} is not darker than near ${lum(beside).toFixed(1)}`);
  assert.ok(lum(beside) - lum(far) < lum(beside) * 0.2, "the tone is a shading, not a different terrain");
});

test("farTone 0 leaves the country alone", () => {
  const state = blank(24);
  pave(state, row(6, 2, 20));
  const g = colours(state, { blend: 1, mottle: 0, farTone: 0, urbanReach: 40 });
  assert.ok(near(g.tile(10, 5), g.tile(10, 20)), "the tone fired with the knob at zero");
});

// --- the shape of the thing --------------------------------------------------

test("every corner of every tile has a colour, on any terrain", () => {
  const state = blank();
  for (let i = 0; i < state.tiles.terrain.length; i += 1) state.tiles.terrain[i] = i % 8;
  const g = colours(state);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      for (let c = 0; c < 4; c += 1) {
        const hex = g.corner(x, y, c);
        assert.ok(Number.isInteger(hex) && hex >= 0 && hex <= 0xffffff,
          `${x},${y} corner ${c} is ${hex}`);
      }
    }
  }
});

test("the ground's numbers live in data", () => {
  const ground = getConfig().ground;
  for (const key of ["blend", "mottle", "urbanReach", "farTone"]) {
    assert.ok(Number.isFinite(ground[key]), `ground.${key} is not a number`);
  }
  assert.ok(ground.blend >= 0 && ground.blend <= 1);
  assert.ok(ground.mottle < 0.2, "a mottle that big is a repaint");
});

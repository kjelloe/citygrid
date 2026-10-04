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
import { NET_PRESENT, NET_AVENUE } from "../client/constants-mirror.js";
import { DEFAULTS, getConfig, setConfig } from "../client/world/config.js";
import { createGroundColour } from "../client/world/ground-colour.js";
import { PALETTES } from "../client/render/palettes.js";
import { zoneTint } from "../client/world/params.js";
import * as countryside from "../client/world/countryside.js";

const PALETTE = PALETTES.plain;
const GRASS = 0;
const FOREST = 2;
const WATER = 3;

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
const column = (x, y0, y1) => Array.from({ length: y1 - y0 + 1 }, (_, k) => [x, y0 + k]);

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
  // not acquire a gradient out of nothing. With every source of variation off
  // — S2's second grass tone is one, so `tone: 0` as well.
  const state = blank();
  const g = colours(state, { blend: 1, mottle: 0, farTone: 0, tone: 0 });
  for (let c = 0; c < 4; c += 1) assert.equal(g.corner(8, 8, c), g.tile(8, 8));
});

test("a corner touching built land keeps the tile's own colour", () => {
  // Otherwise the built thing bleeds into the field and the grid stops reading,
  // which is what the flat-tile decision was protecting.
  //
  // **Amended at A113**: a straight road's EDGE is its verge, which is grass, so
  // the hard edge there moved inward to the carriageway and a neighbour blends
  // with it. What still hard-edges is everything paved corner to corner — a
  // junction, a corner, a stub — which is what this now uses.
  const state = blank();
  pave(state, row(6, 2, 12), column(6, 2, 12));
  const g = colours(state, { blend: 1, mottle: 0, farTone: 0 });
  assert.equal(g.verge(6, 6), undefined, "the crossroads is not paved corner to corner");
  // The grass tile diagonally off the crossroads: one of its corners is the
  // junction, which is tarmac from edge to edge.
  const own = g.tile(5, 5);
  assert.equal(g.corner(5, 5, 3), own, "the corner at the junction bled into the road");
  // And the junction tile itself is flat on every corner.
  for (let c = 0; c < 4; c += 1) {
    assert.equal(g.corner(6, 6, c), g.tile(6, 6), `the junction's corner ${c} is not tarmac`);
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
  const g = colours(state, { blend: 1, mottle: 0, farTone: 0, urbanReach: 40, tone: 0 });
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
  for (const key of ["blend", "mottle", "urbanReach", "farTone", "tone"]) {
    assert.ok(Number.isFinite(ground[key]), `ground.${key} is not a number`);
  }
  assert.ok(ground.blend >= 0 && ground.blend <= 1);
  assert.ok(ground.mottle < 0.2, "a mottle that big is a repaint");
});

// --- the verge (slice V7, A38) ------------------------------------------------

test("a road tile still knows what the land under it is", () => {
  // `tile()` on a road answers tarmac, which is right for the mesh and useless
  // for the verge: the strip of ground either side of a carriageway is inside
  // the road TILE (ruling 035), so asking `tile()` for its colour paints two
  // metres of asphalt-coloured grass. `natural()` is the same tile with nothing
  // built on it — the answer the verge wants.
  const state = blank();
  state.tiles.terrain[tileAt(state.width, 6, 6)] = FOREST;
  pave(state, row(6, 2, 12));
  const g = colours(state, { blend: 0, mottle: 0, farTone: 0 });
  assert.equal(g.tile(6, 6), PALETTE.road, "a road tile is not tarmac any more");
  assert.equal(g.natural(6, 6), PALETTE.terrain[FOREST], "the verge would be painted grass");
});

test("natural ground is natural whether or not anything is built on it", () => {
  const state = blank();
  const g = colours(state, { blend: 0, mottle: 0, farTone: 0 });
  const before = g.natural(4, 4);
  assert.equal(before, g.tile(4, 4));
  state.tiles.zone[tileAt(state.width, 4, 4)] = 1;
  assert.equal(g.natural(4, 4), before, "a zone changed what the land is made of");
});

test("natural clamps to the map like every other accessor", () => {
  const state = blank();
  const g = colours(state, { blend: 0, mottle: 0, farTone: 0 });
  assert.equal(g.natural(-3, -3), g.natural(0, 0));
  assert.equal(g.natural(999, 999), g.natural(state.width - 1, state.height - 1));
});

// --- ground that is somewhere (slice S2) --------------------------------------

test("an empty zoned tile is ground with a faint tint: not the road, not the old slab", () => {
  // Q73: three quarters of zoned ground in a played city is empty, and in the
  // zone's full colour it read as a beige slab the size of the town.
  const state = blank();
  state.tiles.zone[tileAt(16, 9, 9)] = 1;
  const g = colours(state, { blend: 1, mottle: 0, farTone: 0 });
  const plot = g.tile(9, 9);
  assert.notEqual(plot, PALETTE.road, "an empty plot is painted as road");
  assert.ok(!near(plot, zoneTint(1, PALETTE), 6), "an empty plot is still the zone's full colour");
  // Greener than it is anything else: it is ground.
  const [r, gg, b] = rgb(plot);
  assert.ok(gg > r && gg > b, `an empty plot is ${plot.toString(16)}, not green`);
});

test("a crop field's stripes alternate, and a meadow's do not", () => {
  // A street through the middle of a grass map, so there is a town for the
  // fields to ring (they stop FIELD_RANGE from anything built).
  const state = blank(40);
  pave(state, row(20, 2, 37));
  const g = colours(state, { blend: 0, mottle: 0, farTone: 0 });
  const { createCountryside } = countryside;
  const country = createCountryside(state);
  let crops = 0;
  for (let y = 4; y < 36; y += 1) {
    for (let x = 4; x < 35; x += 1) {
      const f = country.at(x, y);
      const n = country.at(f?.stripe === 0 ? x + 1 : x, f?.stripe === 0 ? y : y + 1);
      if (!f || !n || f.kind !== "crop" || n.kind !== "crop" || f.tone !== n.tone || f.track || n.track) continue;
      if (Math.floor(x / 4) !== Math.floor((f.stripe === 0 ? x + 1 : x) / 4)) continue;
      if (Math.floor(y / 4) !== Math.floor((f.stripe === 0 ? y : y + 1) / 4)) continue;
      assert.notEqual(g.tile(x, y), g.tile(f.stripe === 0 ? x + 1 : x, f.stripe === 0 ? y : y + 1),
        `no stripe between ${x},${y} and its neighbour in the same crop`);
      crops += 1;
    }
  }
  assert.ok(crops > 10, `only ${crops} crop stripes checked`);
});

test("sand that meets the water is wet", () => {
  const state = blank();
  const SAND = 6;
  const WATER = 3;
  for (let x = 2; x < 14; x += 1) {
    state.tiles.terrain[tileAt(16, x, 8)] = SAND;
    state.tiles.terrain[tileAt(16, x, 7)] = SAND;
    state.tiles.terrain[tileAt(16, x, 9)] = WATER;
  }
  const g = colours(state, { blend: 0, mottle: 0, farTone: 0 });
  const lum = (hex) => rgb(hex).reduce((s, v) => s + v, 0);
  assert.ok(lum(g.tile(6, 8)) < lum(g.tile(6, 7)), "the sand at the water's edge is as dry as the sand behind it");
});

test("the bed under a bridge keeps the river's colour, not the road's (S13)", () => {
  const state = blank(8);
  for (let y = 0; y < 8; y += 1) state.tiles.terrain[tileAt(8, 4, y)] = WATER;
  pave(state, row(3, 1, 6));
  const colours = createGroundColour(state, PALETTE);
  // Exactly `palette.road` is the defect's own signature: the road branch
  // returns the constant, so a bridge tile was the flat tarmac of a street
  // while the water plane drew over the top of it. Comparing it with the same
  // tile on an unpaved map would not work — `remoteness` darkens everything
  // far from a road, so laying the road changes the bed's colour legitimately.
  assert.notEqual(colours.tile(4, 3), PALETTE.road, "the riverbed went tarmac under the deck");
  assert.equal(colours.tile(3, 3), PALETTE.road, "the road beside it is tarmac, as it should be");
});

// --- the verge from the air (Q102, A113) ----------------------------------------------

test("a straight road tile keeps a verge; a junction is paved corner to corner", () => {
  // From the air a road TILE is asphalt across its whole 20 m, so a street
  // reads as two houses wide against the reference's two thirds of one. Ruling
  // 035 already says what a road tile is — a carriageway, two pavements AND two
  // verges — and L3 draws it that way at street level. This is the same
  // cross-section at city zoom.
  const state = blank(8);
  pave(state, row(3, 1, 6), column(4, 1, 6));
  const g = createGroundColour(state, PALETTE);
  const { width, sidewalk, avenue } = DEFAULTS.road;

  const straight = g.verge(2, 3);
  assert.ok(straight, "a straight street has no verge at all");
  assert.equal(straight.metres, DEFAULTS.tileM / 2 - (width / 2 + sidewalk));
  assert.equal(straight.eastWest, true, "an east-west street's verges run east-west");
  assert.equal(g.verge(4, 2).eastWest, false, "a north-south street's verges run the other way");

  assert.equal(g.verge(4, 3), undefined, "a crossroads has a verge through the middle of it");
  assert.equal(g.verge(1, 3), undefined, "the end of a run is a stub, and a stub is paved");
  assert.equal(g.verge(0, 0), undefined, "unpaved ground has no verge");
});

test("an avenue has no room for a verge, and says so", () => {
  // 14 m of carriageway plus two 2.5 m pavements is 19 m of a 20 m tile. Half a
  // metre of grass each side is a sliver that costs four triangles a tile and
  // draws a line nobody can see — and an avenue filling its tile is correct.
  const state = blank(8);
  const road = state.tiles.road;
  for (let x = 1; x <= 6; x += 1) road[tileAt(8, x, 3)] = NET_PRESENT | NET_AVENUE;
  for (let x = 1; x <= 6; x += 1) {
    const mask = adjacencyMask(8, 8, x, 3, (i) => (road[i] & NET_PRESENT) !== 0);
    road[tileAt(8, x, 3)] = NET_PRESENT | NET_AVENUE | mask;
  }
  const g = createGroundColour(state, PALETTE);
  assert.equal(g.verge(3, 3), undefined, `an avenue's verge is ${DEFAULTS.tileM / 2 - (DEFAULTS.road.avenue.width / 2 + DEFAULTS.road.sidewalk)} m`);
});

test("the grass beside a verge meets it without a seam", () => {
  // `corner()` returns a tile's own colour the moment a neighbour is BUILT, so
  // a road's edge is hard. Where the road's edge is now grass, the hard edge
  // belongs at the carriageway instead: both sides of the tile boundary have to
  // compute the same colour there or the mesh shows a line.
  const state = blank(8);
  pave(state, row(3, 1, 6));
  const g = createGroundColour(state, PALETTE);
  // The corner shared by the road tile (3,3) and the grass tile (3,2): the
  // road's north-west corner is the grass tile's south-west corner.
  const onVerge = g.corner(3, 3, 0);
  const onGrass = g.corner(3, 2, 2);
  assert.equal(onVerge, onGrass, "the verge and the grass beside it are two colours");
  assert.notEqual(onGrass, g.tile(3, 2), "the grass beside a road still hard-edges against it");
});

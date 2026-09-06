// The overlay byte plane (slice V7; ruling 041).
//
// An overlay stopped being 24,000 instanced quads floating at the mean of a
// tile's corners and became one byte a tile, sampled by world x/z in the
// terrain material. The plane itself is pure arithmetic over a typed array, so
// what can go wrong with it is checkable here: a plane the wrong size, a band
// with no colour, a tile read at the wrong index — all of which draw *a*
// picture, and none of which throws.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { NET_PRESENT, FLAG_POWERED, FLAG_WATERED } from "../client/constants-mirror.js";
import { defaultOptions } from "../engine/options.js";
import { OVERLAY_NAMES } from "../client/ui/overlays.js";
import { bandAt, BAND } from "../client/ui/overlays.js";
import { OVERLAY_COLOURS } from "../client/render/palette.js";
import { fillOverlayPlane, PLANE_NONE } from "../client/render/overlay-texture.js";

/** A city every overlay has an opinion about. A fixture that is only terrain
 * makes `zoning` silent and `traffic` uniform, and a test whose fixture cannot
 * make the assertion fail is not testing anything. */
function city(size = 24) {
  const state = createState(defaultOptions({ width: size, height: size, seed: 7 }));
  for (let i = 0; i < state.tiles.terrain.length; i += 1) {
    const x = i % size;
    const y = (i - x) / size;
    state.tiles.pollution[i] = i % 200;
    state.tiles.crime[i] = (i * 7) % 200;
    state.tiles.landValue[i] = (i * 11) % 255;
    state.tiles.fireRisk[i] = (i * 5) % 255;
    state.tiles.healthRisk[i] = (i * 13) % 255;
    if (y % 4 === 0 || x % 5 === 0) {
      state.tiles.road[i] = NET_PRESENT;
      state.tiles.traffic[i] = (i * 3) % 255;
    } else {
      state.tiles.zone[i] = (x + y) % 4;
    }
    state.tiles.wire[i] = (x + y) % 3 === 0 ? NET_PRESENT : 0;
    state.tiles.pipe[i] = (x + y) % 3 === 1 ? NET_PRESENT : 0;
    // Some supplied and some not, or the two utility overlays are a wash.
    state.tiles.flags[i] = (i % 2 === 0 ? FLAG_POWERED : 0) | (i % 3 === 0 ? FLAG_WATERED : 0);
  }
  // Buildings, so `density` has something to count. Placed directly, the way
  // `budget_gate` seeds them.
  let id = 1;
  for (let y = 1; y < size - 1; y += 3) {
    for (let x = 1; x < size - 1; x += 3) {
      const i = y * size + x;
      if (state.tiles.road[i] & NET_PRESENT) continue;
      state.buildings.push({
        id, def: "res", zone: 1, x, y, w: 1, h: 1, owner: 1,
        level: 2, valueTier: 1, occupancy: (id * 9) % 60, condition: 100, builtTick: 0, flags: 0,
      });
      state.tiles.buildingId[i] = id;
      id += 1;
    }
  }
  state.nextId = id;
  return state;
}

test("the plane has one byte per tile, whatever the overlay", () => {
  const state = city(24);
  const plane = new Uint8Array(state.width * state.height);
  for (const name of OVERLAY_NAMES) {
    const written = fillOverlayPlane(plane, state, name);
    assert.equal(written, plane.length, `${name} filled ${written} of ${plane.length}`);
  }
});

test("every byte is a band the palette has a colour for", () => {
  const state = city(24);
  const plane = new Uint8Array(state.width * state.height);
  for (const name of OVERLAY_NAMES) {
    fillOverlayPlane(plane, state, name);
    for (const value of plane) {
      assert.ok(value === PLANE_NONE || OVERLAY_COLOURS[value] !== undefined,
        `${name} wrote band ${value}, which has no colour`);
    }
  }
});

test("the plane says exactly what bandAt says, tile for tile", () => {
  // The one thing that makes this a texture rather than a picture: the byte at
  // (x, y) is the band of the tile at (x, y). An off-by-one in the index is an
  // overlay that is right everywhere and one tile out.
  const state = city(16);
  const plane = new Uint8Array(state.width * state.height);
  for (const name of ["pollution", "crime", "traffic"]) {
    fillOverlayPlane(plane, state, name);
    for (let index = 0; index < plane.length; index += 1) {
      const band = bandAt(state, name, index);
      const want = band === BAND.NONE ? PLANE_NONE : band;
      assert.equal(plane[index], want, `${name} tile ${index}`);
    }
  }
});

test("no overlay writes the whole plane as nothing", () => {
  // A plane of all-NONE is an overlay that is on and invisible, which looks
  // exactly like an overlay that is off.
  const state = city(24);
  const plane = new Uint8Array(state.width * state.height);
  for (const name of OVERLAY_NAMES) {
    fillOverlayPlane(plane, state, name);
    const said = [...plane].filter((v) => v !== PLANE_NONE).length;
    assert.ok(said > 0, `${name} had nothing to say about any of ${plane.length} tiles`);
  }
});

test("no overlay is a wash of one colour either", () => {
  const state = city(24);
  const plane = new Uint8Array(state.width * state.height);
  for (const name of ["pollution", "crime", "traffic", "landValue"]) {
    fillOverlayPlane(plane, state, name);
    assert.ok(new Set(plane).size > 1, `${name} paints every tile the same band`);
  }
});

test("an unknown overlay clears the plane rather than leaving the last one on it", () => {
  const state = city(8);
  const plane = new Uint8Array(state.width * state.height);
  fillOverlayPlane(plane, state, "pollution");
  fillOverlayPlane(plane, state, "");
  assert.ok(plane.every((v) => v === PLANE_NONE), "the previous overlay is still on the ground");
});

test("NONE is a value the shader can test, not a band index", () => {
  // The three bands are 0, 1, 2 and the shader indexes a colour array with
  // them. `BAND.NONE` is 3, which would read past the end — so the plane uses
  // a sentinel the shader compares against instead.
  assert.equal(BAND.NONE, 3);
  assert.ok(PLANE_NONE > 200, `${PLANE_NONE} is too close to a band index to be a sentinel`);
  assert.equal(OVERLAY_COLOURS.length, 4);
});

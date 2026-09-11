// Where the city is (slice K4).
//
// `Home` fitted the whole MAP before this slice, which on a big map with a town
// in one corner is a way of losing the city rather than finding it. The fit is
// pure arithmetic over state, so the cases that matter — a corner town, an
// empty map, one tile — are planted here rather than discovered by zooming out
// in a browser and squinting.

import test from "node:test";
import assert from "node:assert/strict";
import { builtBounds, fitBounds, sameView, FIT_MARGIN, FIT_MIN_SPAN } from "../client/world/fit.js";
import { NET_PRESENT } from "../client/constants-mirror.js";

function emptyState(width = 64, height = 64) {
  return {
    width,
    height,
    tiles: { road: new Uint8Array(width * height) },
    buildings: [],
  };
}

const pave = (state, x, y) => { state.tiles.road[y * state.width + x] |= NET_PRESENT; };

test("an untouched map has no built bounds, and fits the map", () => {
  const state = emptyState();
  assert.equal(builtBounds(state), undefined);
  const view = fitBounds(state);
  assert.equal(view.targetX, 32);
  assert.equal(view.targetZ, 32);
  assert.equal(view.span, 64 * FIT_MARGIN);
});

test("a town in one corner is framed, not the map around it", () => {
  // The defect this slice is about. A 128×128 with eight tiles of road in the
  // corner used to fit 128 tiles of grass.
  const state = emptyState(128, 128);
  for (let x = 4; x < 12; x += 1) pave(state, x, 6);
  const view = fitBounds(state);
  assert.deepEqual(builtBounds(state), { minX: 4, minY: 6, maxX: 11, maxY: 6 });
  assert.equal(view.targetX, 8);
  assert.equal(view.targetZ, 6.5);
  assert.ok(view.span < 20, `span ${view.span} is most of the map, not the town`);
});

test("buildings count, and a building is its whole footprint", () => {
  const state = emptyState();
  state.buildings.push({ x: 10, y: 10, w: 3, h: 2 });
  assert.deepEqual(builtBounds(state), { minX: 10, minY: 10, maxX: 12, maxY: 11 });
});

test("zoning is not building", () => {
  // A painted district with nothing on it is an intention. A camera that frames
  // intentions drifts away from the city every time somebody paints ahead.
  const state = emptyState();
  state.tiles.zone = new Uint8Array(state.width * state.height);
  state.tiles.zone[20 * state.width + 20] = 1;
  assert.equal(builtBounds(state), undefined);
});

test("one tile does not put the camera in the street", () => {
  // `MIN_SPAN` is where street mode is on the other side of, so a fit that
  // zoomed all the way to one road tile would drop the player onto the pavement
  // for pressing Home.
  const state = emptyState();
  pave(state, 30, 30);
  assert.equal(fitBounds(state).span, FIT_MIN_SPAN);
});

test("the span is the longer side, or half the city is off screen", () => {
  const state = emptyState(96, 96);
  for (let x = 10; x < 70; x += 1) pave(state, x, 40);
  for (let y = 38; y < 44; y += 1) pave(state, 10, y);
  const view = fitBounds(state);
  assert.ok(view.span >= 60 * FIT_MARGIN - 1e-9, `span ${view.span} cannot hold 60 tiles`);
});

test("two views a fraction of a tile apart are the same place", () => {
  // Floating point: the view a player left is never bit-identical to the one
  // they come back to, and a comparison that demanded it would make the second
  // Home press do nothing on one machine and everything on another.
  const a = { targetX: 10, targetZ: 20, span: 40 };
  assert.equal(sameView(a, { targetX: 10.2, targetZ: 20.1, span: 40.3 }), true);
  assert.equal(sameView(a, { targetX: 14, targetZ: 20, span: 40 }), false);
  assert.equal(sameView(a, undefined), false);
});

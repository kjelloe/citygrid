// The L3 prop pass (slice E5; spec §6.6).
//
// Props are the difference between a street and a diagram, and none of that
// fails a test. What does fail a test is a lamp standing in the carriageway,
// a hedge across the front path, or a prop pass that quietly places nothing —
// so those are what this asserts.

import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS } from "../client/world/config.js";
import { lamps, buildProps } from "../client/render/props-l3.js";
import { PALETTES } from "../client/render/palettes.js";

const flat = () => 0;
const STREET = [{ x: 0, z: 0 }, { x: 200, z: 0 }];
const HALF = DEFAULTS.road.width / 2;
const OFFSET = HALF + DEFAULTS.road.sidewalk / 2;

test("lamps stand on the pavement, never in the carriageway", () => {
  const placed = lamps(STREET, OFFSET, DEFAULTS.props.lampSpacing, DEFAULTS.props.lampH, flat);
  assert.ok(placed.length > 4, `${placed.length} lamps on 200 m`);
  for (const lamp of placed) {
    assert.ok(Math.abs(lamp.z) > HALF, `a lamp ${Math.abs(lamp.z)} m from the centre line`);
    assert.ok(Math.abs(lamp.z) < HALF + DEFAULTS.road.sidewalk, "and not out in the verge");
  }
});

test("lamps alternate sides, so a street is not a runway down one edge", () => {
  const placed = lamps(STREET, OFFSET, DEFAULTS.props.lampSpacing, DEFAULTS.props.lampH, flat);
  const sides = placed.map((l) => Math.sign(l.z));
  for (let i = 1; i < sides.length; i += 1) assert.notEqual(sides[i], sides[i - 1]);
});

test("lamps are spaced the way the data says", () => {
  const placed = lamps(STREET, OFFSET, DEFAULTS.props.lampSpacing, DEFAULTS.props.lampH, flat);
  for (let i = 1; i < placed.length; i += 1) {
    const gap = Math.hypot(placed[i].x - placed[i - 1].x, placed[i].z - placed[i - 1].z);
    // Two lamps on opposite sides of the street are further apart than the
    // spacing along it, which is the whole point of measuring along x.
    assert.ok(Math.abs((placed[i].x - placed[i - 1].x) - DEFAULTS.props.lampSpacing) < 1e-6, `${gap} m apart`);
  }
});

test("a street with no length gets no lamps and does not throw", () => {
  assert.deepEqual(lamps([{ x: 0, z: 0 }], OFFSET, 24, 4.5, flat), []);
  assert.deepEqual(lamps(undefined, OFFSET, 24, 4.5, flat), []);
});

test("the pass builds something, and its pieces are never empty", () => {
  const lot = { x0: 20, z0: 12, x1: 34, z1: 12 };
  const { pieces } = buildProps({
    corridors: [STREET],
    lots: [{ lot, out: { x: 0, z: -1 }, kind: "residential" }],
    cfg: DEFAULTS,
    heightAt: flat,
    palette: PALETTES.plain,
  });
  assert.ok(pieces.length >= 2, `${pieces.length} pieces`);
  for (const piece of pieces) assert.ok(piece.part.triangles > 0);
});

test("the hedge leaves a gap for the path, and the path crosses it", () => {
  const lot = { x0: 20, z0: 12, x1: 34, z1: 12 };
  const { pieces } = buildProps({
    corridors: [],
    lots: [{ lot, out: { x: 0, z: -1 }, kind: "residential" }],
    cfg: DEFAULTS,
    heightAt: flat,
    palette: PALETTES.plain,
  });
  const hedge = pieces.find((p) => p.colour === PALETTES.plain.lawn).part;
  const mid = (lot.x0 + lot.x1) / 2;
  // No hedge triangle spans the middle of the frontage, where the path is.
  for (let t = 0; t < hedge.triangles; t += 1) {
    const xs = [hedge.position[t * 9], hedge.position[t * 9 + 3], hedge.position[t * 9 + 6]];
    const covers = Math.min(...xs) < mid - 0.1 && Math.max(...xs) > mid + 0.1;
    assert.equal(covers, false, `a hedge across the path at x ${mid}`);
  }
  const path = pieces.find((p) => p.colour === PALETTES.plain.civic).part;
  assert.ok(path.triangles > 0, "there is no path to the door");
});

test("a lamp reports where its light hangs, and every id is its own", () => {
  const { lamps: placed } = buildProps({
    corridors: [STREET],
    lots: [],
    cfg: DEFAULTS,
    heightAt: flat,
    palette: PALETTES.plain,
    chunk: 3,
  });
  assert.ok(placed.length > 4);
  assert.equal(new Set(placed.map((l) => l.id)).size, placed.length);
  for (const lamp of placed) {
    // The light is on the end of the bracket, over the road — not on the post.
    assert.ok(Math.abs(lamp.z) < HALF + DEFAULTS.road.sidewalk, `a light at z ${lamp.z}`);
    assert.ok(lamp.y > DEFAULTS.props.lampH - 1, `a light ${lamp.y} m up a ${DEFAULTS.props.lampH} m lamp`);
  }
});

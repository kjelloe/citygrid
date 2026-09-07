// Street furniture, and the fact that you can walk into it (slice E7; A43).
//
// Lamps and hedges were geometry and nothing else: a lamp post was a picture of
// a lamp post, and the walker went straight through it. A43 makes them solid,
// which means the placement has to move OUT of `client/render/` — the collision
// world is in `client/world/` and may not import a renderer module — and it
// means the placement itself is now load-bearing rather than decorative.
//
// The finding this file exists for: a lamp in the middle of the pavement is a
// lamp in the middle of where the walker walks. It was at `half + sidewalk / 2`,
// which is exactly the line `walkthrough` walks, so every leg on a pavement
// ground to a halt on a post every 24 m. It stands `lampInset` out from the
// kerb now.

import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, getConfig, setConfig } from "../client/world/config.js";
import {
  lampsAlong, lampOffset, hedgeSpans, furnitureBoxes, POST_HALF, HEDGE_HALF,
} from "../client/world/street-furniture.js";

setConfig(DEFAULTS);

const line = (n = 10, step = 10) => {
  const pts = [];
  for (let i = 0; i < n; i += 1) pts.push({ x: i * step, z: 0 });
  return pts;
};
const flat = () => 0;

test("lamps march along a corridor at the spacing the data asks for", () => {
  const cfg = getConfig();
  const out = lampsAlong(line(), lampOffset(cfg), cfg.props.lampSpacing, cfg.props.lampH, flat);
  assert.ok(out.length >= 3, `${out.length} lamps over 90 m`);
  for (let i = 1; i < out.length; i += 1) {
    const d = Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z);
    // Alternating sides, so consecutive lamps are a spacing apart along the
    // street and twice the offset across it.
    assert.ok(Math.abs(d - Math.hypot(cfg.props.lampSpacing, 2 * lampOffset(cfg))) < 1e-6, `${d} m apart`);
  }
});

test("lamps alternate sides", () => {
  const cfg = getConfig();
  const out = lampsAlong(line(), lampOffset(cfg), cfg.props.lampSpacing, cfg.props.lampH, flat);
  for (let i = 1; i < out.length; i += 1) {
    assert.notEqual(Math.sign(out[i].z), Math.sign(out[i - 1].z), "two lamps on the same side");
  }
});

test("a lamp stands clear of the line a walker walks (A43)", () => {
  // The pavement runs from `half` to `half + sidewalk`; `walkthrough` walks its
  // middle. A 0.34 m walker on that line must not touch the post.
  const cfg = getConfig();
  const half = cfg.road.width / 2;
  const walked = half + cfg.road.sidewalk / 2;
  const offset = lampOffset(cfg);
  assert.ok(offset > half, `a lamp at ${offset} m is in the carriageway`);
  assert.ok(offset + POST_HALF < half + cfg.road.sidewalk, `a lamp at ${offset} m hangs off the kerb`);
  assert.ok(walked - (offset + POST_HALF) > 0.34,
    `only ${(walked - offset - POST_HALF).toFixed(2)} m between the post and the walked line`);
});

test("a lamp is a thin box, not a cube round its head", () => {
  const cfg = getConfig();
  const [lamp] = lampsAlong(line(2, 30), lampOffset(cfg), cfg.props.lampSpacing, cfg.props.lampH, flat);
  const boxes = furnitureBoxes({ corridors: [], lots: [], heightAt: flat }, [lamp], []);
  assert.equal(boxes.length, 1);
  const b = boxes[0];
  assert.ok(b.x1 - b.x0 <= 0.2 && b.z1 - b.z0 <= 0.2, `a ${(b.x1 - b.x0).toFixed(2)} m post`);
  assert.ok(b.yTop - b.yBase > 2, "a walker could step over it");
});

test("a hedge leaves the gap the path goes through", () => {
  const cfg = getConfig();
  const front = { x0: 0, z0: 0, x1: 12, z1: 0 };
  const spans = hedgeSpans(front, cfg.props);
  assert.equal(spans.length, 2, "the hedge has no gate in it");
  const gap = Math.hypot(spans[1].ax - spans[0].bx, spans[1].az - spans[0].bz);
  assert.ok(gap >= cfg.props.pathW, `a ${gap.toFixed(2)} m gap for a ${cfg.props.pathW} m path`);
});

test("a frontage too short for a gate gets no hedge rather than a negative one", () => {
  const cfg = getConfig();
  const spans = hedgeSpans({ x0: 0, z0: 0, x1: 1.2, z1: 0 }, cfg.props);
  assert.deepEqual(spans, []);
});

test("the furniture boxes are seated on their own ground, not on zero", () => {
  const cfg = getConfig();
  const slope = (x) => x / 10;
  const lamps = lampsAlong(line(), lampOffset(cfg), cfg.props.lampSpacing, cfg.props.lampH, slope);
  const boxes = furnitureBoxes({ corridors: [], lots: [], heightAt: slope }, lamps, []);
  const ys = boxes.map((b) => b.yBase);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 1, "every post is at the same height on a hill");
});

test("a hedge box is thin and low — a wall you can see over and not step over", () => {
  const cfg = getConfig();
  const front = { x0: 0, z0: 0, x1: 12, z1: 0 };
  const boxes = furnitureBoxes({ corridors: [], lots: [], heightAt: flat }, [], [front]);
  assert.equal(boxes.length, 2);
  for (const b of boxes) {
    assert.ok(b.z1 - b.z0 <= 2 * HEDGE_HALF + 1e-9, "a hedge as thick as a room");
    assert.ok(b.yTop - b.yBase > 0.6, "a walker could step over it");
    assert.ok(b.yTop - b.yBase < 1.5, "a hedge you cannot see over is a wall");
  }
});

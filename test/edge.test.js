// Edge scrolling and the border pull (slice K3, A59).
//
// Kjell answered Q82 with both halves: "edge scrolling when using mouse, on
// touch devices, pull and drag from the border to move." A mouse hovers and a
// finger does not, so the two are one idea in two shapes — and the geometry is
// pure so it can be argued about here rather than by waving a pointer at a
// browser.

import test from "node:test";
import assert from "node:assert/strict";
import {
  edgeScroll, edgeBand, isBorderPull, EDGE_MIN_PX, EDGE_MAX_PX, EDGE_SECONDS,
} from "../client/input/edge.js";
import { PAN_SECONDS } from "../client/ui/camera-model.js";

const W = 1280;
const H = 720;

test("the middle of the canvas asks for nothing", () => {
  assert.deepEqual(edgeScroll(W / 2, H / 2, W, H), { x: 0, y: 0 });
});

test("each edge pushes the view its own way", () => {
  assert.ok(edgeScroll(1, H / 2, W, H).x < 0, "the left edge does not pan left");
  assert.ok(edgeScroll(W - 1, H / 2, W, H).x > 0, "the right edge does not pan right");
  assert.ok(edgeScroll(W / 2, 1, W, H).y < 0, "the top edge does not pan up");
  assert.ok(edgeScroll(W / 2, H - 1, W, H).y > 0, "the bottom edge does not pan down");
});

test("a corner asks for both at once", () => {
  const corner = edgeScroll(1, 1, W, H);
  assert.ok(corner.x < 0 && corner.y < 0, JSON.stringify(corner));
});

test("the lean is ramped, not a switch", () => {
  // A player reaching for a control near the edge should not get a lurch. One
  // pixel inside the band barely moves; against the frame it is full speed.
  const band = edgeBand(W, H);
  const justInside = Math.abs(edgeScroll(band - 1, H / 2, W, H).x);
  const hardAgainst = Math.abs(edgeScroll(0, H / 2, W, H).x);
  assert.ok(justInside < 0.05, `${justInside} at the inner lip of the band`);
  assert.ok(hardAgainst > 0.95, `${hardAgainst} against the frame`);
  assert.ok(justInside < hardAgainst);
});

test("nothing ever asks for more than full speed", () => {
  for (const [px, py] of [[0, 0], [W, H], [-0, H], [W, 0], [1, 1]]) {
    const r = edgeScroll(px, py, W, H);
    assert.ok(Math.abs(r.x) <= 1 && Math.abs(r.y) <= 1, `${px},${py} → ${JSON.stringify(r)}`);
  }
});

test("a pointer that has left the canvas is not asking for anything", () => {
  // The failure this prevents: the browser reports the last known position when
  // the player has gone to another application, and the city pans for a minute
  // while nobody is looking at it.
  for (const [px, py] of [[-5, H / 2], [W + 5, H / 2], [W / 2, -5], [W / 2, H + 5]]) {
    assert.deepEqual(edgeScroll(px, py, W, H), { x: 0, y: 0 }, `${px},${py}`);
  }
});

test("the band is a fraction of the canvas, within reason", () => {
  // 24 px is a comfortable band on a laptop and a sliver on a 4K panel; the
  // control has to feel the same on both, so it scales — and is capped at each
  // end so it never becomes absurd.
  assert.ok(edgeBand(3840, 2160) > edgeBand(1280, 720), "the band does not scale up");
  assert.ok(edgeBand(3840, 2160) <= EDGE_MAX_PX, "the band is unbounded above");
  assert.ok(edgeBand(320, 240) >= EDGE_MIN_PX, "the band vanishes on a small canvas");
});

test("a degenerate canvas asks for nothing rather than dividing by zero", () => {
  assert.deepEqual(edgeScroll(0, 0, 0, 0), { x: 0, y: 0 });
  assert.equal(isBorderPull(0, 0, 0, 0), false);
});

test("the border pull is decided by where the drag STARTED", () => {
  // The touch half. It must not steal the one-finger pan or a drag-paint that
  // happens to pass near the frame, so the start decides, once.
  assert.equal(isBorderPull(2, H / 2, W, H), true, "a drag from the left border is not a pull");
  assert.equal(isBorderPull(W / 2, H / 2, W, H), false, "a drag from the middle is a pull");
  assert.equal(isBorderPull(W / 2, H - 2, W, H), true, "a drag from the bottom border is not a pull");
});

test("edge scrolling and the pad agree about what a pan is", () => {
  // Every way of panning moves at one speed, or the control the player learns
  // first makes the others feel broken.
  assert.equal(EDGE_SECONDS, PAN_SECONDS);
});

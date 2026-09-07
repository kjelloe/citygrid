// The minimap's arithmetic (slice 4.1's last piece).
//
// Everything that is wrong by one, inverted, or off by half a tile — and none
// of it visible in a 160-pixel picture until you click it and the camera jumps
// somewhere else.

import test from "node:test";
import assert from "node:assert/strict";
import {
  scaleFor, tileToPixel, pixelToTile, viewportRect, rectIsInformative,
  viewportShape, walkerMark,
} from "../client/render/minimap-model.js";

const SIZE = 160;

test("a click lands on the tile it was aimed at", () => {
  // The round trip is the whole contract: what the player sees at a pixel is
  // what the camera goes to when they click it.
  for (const [x, y] of [[0, 0], [1, 1], [31, 47], [63, 63]]) {
    const pixel = tileToPixel(x, y, SIZE, 64, 64);
    // Aim at the middle of the tile's cell, which is where a finger lands.
    const back = pixelToTile(pixel.x + 1, pixel.y + 1, SIZE, 64, 64);
    assert.deepEqual(back, { x, y }, `(${x}, ${y}) round-tripped to (${back.x}, ${back.y})`);
  }
});

test("a click outside the square lands on the edge rather than nowhere", () => {
  // A click one pixel past a 160-pixel box is a click on the edge of the map.
  // Refusing it makes the corners of the minimap dead.
  assert.deepEqual(pixelToTile(-8, -8, SIZE, 64, 64), { x: 0, y: 0 });
  assert.deepEqual(pixelToTile(SIZE + 8, SIZE + 8, SIZE, 64, 64), { x: 63, y: 63 });
  assert.deepEqual(pixelToTile(SIZE, 0, SIZE, 64, 64), { x: 63, y: 0 });
});

test("every region size fills the same square", () => {
  for (const size of [48, 64, 96, 128]) {
    const corner = tileToPixel(size - 1, size - 1, SIZE, size, size);
    assert.ok(corner.x < SIZE && corner.x > SIZE - SIZE / size - 0.001,
      `${size}: last tile at ${corner.x} of ${SIZE}`);
    assert.equal(scaleFor(SIZE, size, size), SIZE / size);
  }
});

test("the viewport box is centred on the camera", () => {
  const view = { targetX: 32, targetZ: 32, span: 32 };
  const rect = viewportRect(view, 1, SIZE, 64, 64);
  assert.equal(rect.x + rect.width / 2, SIZE / 2);
  assert.equal(rect.y + rect.height / 2, SIZE / 2);
});

test("the box is wider than it is tall on a wide screen", () => {
  // `span` is tiles down the HEIGHT, so the width depends on the aspect ratio.
  // Getting this backwards draws a box that is wrong on every desktop.
  const view = { targetX: 32, targetZ: 32, span: 32 };
  const wide = viewportRect(view, 16 / 9, SIZE, 64, 64);
  assert.ok(wide.width > wide.height, `${wide.width} × ${wide.height}`);
  const tall = viewportRect(view, 9 / 16, SIZE, 64, 64);
  assert.ok(tall.width < tall.height);
});

test("the box hangs over the edge rather than being clamped", () => {
  // When the player pans to a corner the box should leave the map, because
  // that is what the camera is doing. Clamping it would say the camera is
  // somewhere it is not.
  const view = { targetX: 0, targetZ: 0, span: 32 };
  const rect = viewportRect(view, 1, SIZE, 64, 64);
  assert.ok(rect.x < 0 && rect.y < 0, `${rect.x}, ${rect.y}`);
});

test("a box that covers everything is not drawn", () => {
  // Zoomed all the way out, a border around the whole minimap is noise.
  const out = viewportRect({ targetX: 32, targetZ: 32, span: 200 }, 1, SIZE, 64, 64);
  assert.equal(rectIsInformative(out, SIZE), false);
  const close = viewportRect({ targetX: 32, targetZ: 32, span: 20 }, 1, SIZE, 64, 64);
  assert.equal(rectIsInformative(close, SIZE), true);
});

// --- what the camera is actually looking at (slice V8) -----------------------

test("under perspective the minimap shows the FOOTPRINT, not a box round it", () => {
  // `viewportRect` is a rectangle centred on the target with the span for its
  // height, which is exactly what an orthographic camera sees and nothing like
  // what a perspective one does: a frustum at a low pitch is a wedge that opens
  // out towards the horizon, and the box round it holds several times the
  // ground the player can see.
  const view = {
    mode: "city", span: 40, targetX: 32, targetZ: 32, yaw: 0, pitch: 0.35, fov: 50,
    persp: { near: 0.5, far: 4000 },
  };
  const shape = viewportShape(view, 16 / 9, 160, 64, 64);
  assert.equal(shape.kind, "polygon", `a perspective view drew a ${shape.kind}`);
  assert.equal(shape.points.length, 4);
  // A wedge: the far edge is wider than the near one.
  const width = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const [p0, p1, p2, p3] = shape.points;
  const edges = [width(p0, p1), width(p1, p2), width(p2, p3), width(p3, p0)].sort((a, b) => a - b);
  assert.ok(edges[3] > edges[0] * 1.3, `the four edges are ${edges.map((e) => e.toFixed(1)).join(", ")}`);
});

test("under orthographic it is still a rectangle", () => {
  const view = { mode: "ortho", span: 20, targetX: 32, targetZ: 32, yaw: 0, pitch: 0.6 };
  const shape = viewportShape(view, 1, 160, 64, 64);
  assert.equal(shape.kind, "rect");
  assert.ok(Math.abs(shape.rect.x + shape.rect.width / 2 - 32 * (160 / 64)) < 1e-6);
});

test("the footprint is in minimap pixels, like everything else here", () => {
  const view = {
    mode: "city", span: 20, targetX: 10, targetZ: 10, yaw: 0, pitch: 0.5, fov: 50,
    persp: { near: 0.5, far: 4000 },
  };
  const shape = viewportShape(view, 1, 160, 64, 64);
  const scale = scaleFor(160, 64, 64);
  for (const p of shape.points) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${p.x}, ${p.y}`);
    // Roughly around the target, times the scale — not still in tiles.
    assert.ok(Math.abs(p.x - 10 * scale) < 160 * 4, `${p.x}`);
  }
});

test("a covering ORTHOGRAPHIC view is still not worth drawing", () => {
  const view = { mode: "ortho", span: 400, targetX: 32, targetZ: 32, yaw: 0, pitch: 0.9 };
  assert.equal(viewportShape(view, 1, 160, 64, 64).kind, "none");
});

test("a covering perspective view IS worth drawing, because it has a direction", () => {
  // A box that fills the minimap says only "you can see everything". A wedge
  // that fills it still says which way you are looking, and under perspective
  // that is the one thing the minimap cannot otherwise tell you.
  const view = {
    mode: "city", span: 400, targetX: 32, targetZ: 32, yaw: 0, pitch: 0.35, fov: 50,
    persp: { near: 0.5, far: 4000 },
  };
  assert.equal(viewportShape(view, 1, 160, 64, 64).kind, "polygon");
});

// --- the walker (slice V8) -----------------------------------------------------

test("in street mode the minimap knows where the walker is", () => {
  // It has never known the walker exists: the box is drawn from `targetX/Z`,
  // which in street mode IS the walker — but a 40-tile box round a person on a
  // pavement says nothing, and a dot says exactly the one thing that matters.
  const view = {
    mode: "street", span: 20, targetX: 20, targetZ: 44, yaw: 1, pitch: 0, fov: 50,
    eye: { x: 20, y: 2, z: 44 }, persp: { near: 0.02, far: 100 },
  };
  const mark = walkerMark(view, 160, 64, 64);
  assert.ok(mark, "the walker is not on the map");
  const scale = scaleFor(160, 64, 64);
  assert.ok(Math.abs(mark.x - 20 * scale) < 1e-6, `${mark.x}`);
  assert.ok(Math.abs(mark.y - 44 * scale) < 1e-6, `${mark.y}`);
  // And which way they are facing, so the dot is a person and not a pin.
  assert.ok(Number.isFinite(mark.yaw));
});

test("out of the street there is no walker to show", () => {
  for (const mode of ["city", "ortho"]) {
    assert.equal(walkerMark({ mode, span: 20, targetX: 5, targetZ: 5 }, 160, 64, 64), undefined);
  }
});

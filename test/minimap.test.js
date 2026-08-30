// The minimap's arithmetic (slice 4.1's last piece).
//
// Everything that is wrong by one, inverted, or off by half a tile — and none
// of it visible in a 160-pixel picture until you click it and the camera jumps
// somewhere else.

import test from "node:test";
import assert from "node:assert/strict";
import { scaleFor, tileToPixel, pixelToTile, viewportRect, rectIsInformative } from "../client/render/minimap-model.js";

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

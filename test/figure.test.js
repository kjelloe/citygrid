// The person seen from the air (slice B7). `client/world/figure.js` is the
// geometry `building-kit.js` hands to three; node checks it here because it
// cannot check the kit.

import test from "node:test";
import assert from "node:assert/strict";
import { cityFigure, CITY_FIGURE_TRIANGLES } from "../client/world/figure.js";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test("the figure is twelve triangles, the item's number", () => {
  assert.equal(cityFigure().length, CITY_FIGURE_TRIANGLES);
  assert.equal(CITY_FIGURE_TRIANGLES, 12);
});

test("the figure is a person's size: 1.6 to 2 m tall, narrower than a pavement", () => {
  const pts = cityFigure().flatMap((f) => f.tri);
  const top = Math.max(...pts.map((p) => p[1]));
  const bottom = Math.min(...pts.map((p) => p[1]));
  const wide = Math.max(...pts.map((p) => Math.hypot(p[0], p[2])));
  assert.equal(bottom, 0, "the figure does not stand on the ground");
  assert.ok(top * 20 >= 1.6 && top * 20 <= 2, `${(top * 20).toFixed(2)} m tall`);
  assert.ok(wide * 20 < 0.5, `${(wide * 20).toFixed(2)} m from the middle to the widest point`);
});

test("every face points out of the part it belongs to, and none is degenerate", () => {
  // Winding and normals are two halves of one fact (E3): a face wound inwards
  // is culled from outside and the figure flickers as the camera orbits.
  const faces = cityFigure();
  for (const part of [faces.slice(0, 8), faces.slice(8)]) {
    const pts = part.flatMap((f) => f.tri);
    const centre = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
    for (const { tri: [a, b, c] } of part) {
      const n = cross(sub(b, a), sub(c, a));
      assert.ok(Math.hypot(...n) > 1e-8, "a triangle with no area");
      const mid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      assert.ok(dot(n, sub(mid, centre)) > 0, "a face wound into the figure");
    }
  }
});

test("the head is a different shade from the body, so it reads as a head", () => {
  const shades = new Set(cityFigure().map((f) => f.shade));
  assert.equal(shades.size, 2);
});

// Draped ribbons (slice E3; spec §5.2).
//
// A carriageway, a kerb face, a sidewalk and a sagging wire are all one
// primitive: a quad strip along a polyline with every vertex sampled from the
// height field. Union Square calls it `strip`, Higashiyama calls it `ribbon`,
// and ruling 039 says we write it rather than vendor it.
//
// Pure arithmetic over arrays, so it lives on the node side of the line that
// three draws through this renderer. What it has to get right is exactly what
// no screenshot shows: whether the vertices sit ON the ground rather than
// through it, whether the camber leans the right way, and whether a strip that
// turns a corner keeps its width.

import test from "node:test";
import assert from "node:assert/strict";
import { ribbon, skirt, sagCurve, dashes } from "../client/render/ribbon.js";

const line = (n, step = 10) => Array.from({ length: n }, (_, i) => ({ x: i * step, z: 0 }));
const flat = (y) => () => y;
/** A ramp climbing eastward, in metres. */
const ramp = (slope) => (x) => x * slope;

const vertexCount = (r) => r.position.length / 3;
const y = (r, i) => r.position[i * 3 + 1];

// --- the strip ---------------------------------------------------------------

test("a straight ribbon is two triangles per step", () => {
  // Five points is four spans is eight triangles: the arithmetic the budget
  // will be spent against.
  const r = ribbon(line(5), 4, flat(0));
  assert.equal(r.triangles, 8);
  assert.equal(vertexCount(r), 24, "non-indexed: three vertices a triangle");
});

test("a ribbon is the width it was asked for", () => {
  const r = ribbon(line(2), 4, flat(0), { camber: 0 });
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < vertexCount(r); i += 1) {
    const z = r.position[i * 3 + 2];
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  assert.ok(Math.abs((maxZ - minZ) - 8) < 1e-5, `${(maxZ - minZ).toFixed(3)} m wide, asked for 8`);
});

test("every vertex sits on the ground plus the lift", () => {
  // The whole point of draping. A ribbon at a constant y is a ribbon that
  // disappears into the first hill it crosses.
  const field = ramp(0.2);
  const r = ribbon(line(6), 4, field, { lift: 0.02, camber: 0 });
  for (let i = 0; i < vertexCount(r); i += 1) {
    const x = r.position[i * 3];
    assert.ok(Math.abs(y(r, i) - (field(x) + 0.02)) < 1e-5,
      `vertex ${i} at y=${y(r, i).toFixed(3)}, ground ${field(x).toFixed(3)}`);
  }
});

test("camber lowers the edges and leaves the centre alone", () => {
  // A road is crowned so water runs off it, and the crown is what stops a wide
  // carriageway reading as a flat sheet of grey.
  const straight = ribbon(line(3), 4, flat(0), { camber: 0 });
  const crowned = ribbon(line(3), 4, flat(0), { camber: 0.035 });
  let lowest = Infinity;
  let highest = -Infinity;
  for (let i = 0; i < vertexCount(crowned); i += 1) {
    lowest = Math.min(lowest, y(crowned, i));
    highest = Math.max(highest, y(crowned, i));
  }
  assert.ok(Math.abs(highest) < 1e-6, "the crown moved off the ground");
  assert.ok(Math.abs(lowest + 0.035) < 1e-6, `the edge dropped ${lowest}, expected -0.035`);
  // A crown needs a middle row of vertices, so it costs twice the triangles.
  // A two-column strip has no centre to raise: "lower the edges" applied to it
  // lowers the whole ribbon, which is what the first version did.
  assert.equal(crowned.triangles, straight.triangles * 2,
    "a camber that costs nothing is a camber that moved the whole road down");
});

test("a ribbon round a corner keeps its width", () => {
  // The mitre. Offsetting each point along its own segment's normal pinches the
  // inside of a turn to nothing; the average of the two adjacent normals does
  // not, and a pinched kerb is the thing you notice from the pavement.
  const corner = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 20 }];
  const r = ribbon(corner, 4, flat(0), { camber: 0 });
  assert.equal(r.triangles, 4, "three points is two spans is four triangles");
  for (let i = 0; i < vertexCount(r); i += 1) {
    assert.ok(Number.isFinite(r.position[i * 3]), `vertex ${i} is not a number`);
  }
});

test("normals point up on flat ground", () => {
  const r = ribbon(line(4), 3, flat(0), { camber: 0 });
  for (let i = 0; i < vertexCount(r); i += 1) {
    assert.ok(Math.abs(r.normal[i * 3 + 1] - 1) < 1e-5, `normal ${i} is not up`);
  }
});

test("uv runs in metres along the ribbon", () => {
  // So a marking canvas or a texture repeats at a real-world scale rather than
  // stretching with the length of whatever corridor it landed on.
  const r = ribbon(line(4, 10), 4, flat(0), { camber: 0 });
  let maxU = 0;
  for (let i = 0; i < vertexCount(r); i += 1) maxU = Math.max(maxU, r.uv[i * 2]);
  assert.ok(Math.abs(maxU - 30) < 1e-5, `u ran to ${maxU}, expected the 30 m length`);
});

test("a degenerate polyline is nothing, not a crash", () => {
  assert.equal(ribbon([], 4, flat(0)).triangles, 0);
  assert.equal(ribbon([{ x: 0, z: 0 }], 4, flat(0)).triangles, 0);
  const repeated = ribbon([{ x: 5, z: 5 }, { x: 5, z: 5 }], 4, flat(0));
  for (let i = 0; i < vertexCount(repeated); i += 1) {
    assert.ok(Number.isFinite(repeated.position[i * 3]), "a zero-length span made a NaN");
  }
});

// --- the kerb ----------------------------------------------------------------

test("a skirt hangs from the edge and is vertical", () => {
  // The kerb face: what turns a 0.15 m step into something you can see from
  // the pavement rather than a colour change.
  const s = skirt(line(4), 4, flat(0), 0.15);
  assert.equal(s.triangles, 6 * 2, "two faces, one each side, two triangles a span");
  let top = -Infinity;
  let bottom = Infinity;
  for (let i = 0; i < s.position.length / 3; i += 1) {
    top = Math.max(top, s.position[i * 3 + 1]);
    bottom = Math.min(bottom, s.position[i * 3 + 1]);
  }
  assert.ok(Math.abs(top) < 1e-6 && Math.abs(bottom + 0.15) < 1e-6,
    `skirt spans ${bottom} to ${top}`);
});

test("a skirt follows the ground it hangs from", () => {
  const field = ramp(0.1);
  const s = skirt(line(4), 4, field, 0.15);
  for (let i = 0; i < s.position.length / 3; i += 1) {
    const x = s.position[i * 3];
    const h = s.position[i * 3 + 1];
    assert.ok(h <= field(x) + 1e-5 && h >= field(x) - 0.15 - 1e-5,
      `vertex at ${h.toFixed(3)} is outside the skirt hanging from ${field(x).toFixed(3)}`);
  }
});

// --- the wire ----------------------------------------------------------------

test("a sagging wire dips in the middle and meets its poles", () => {
  // Eight triangles a span, and the single thing that most makes a suburb read
  // as a suburb from eye height (spec §5.4).
  const pts = sagCurve({ x: 0, y: 10, z: 0 }, { x: 60, y: 10, z: 0 }, 1.5, 8);
  assert.equal(pts.length, 9);
  assert.ok(Math.abs(pts[0].y - 10) < 1e-6 && Math.abs(pts[8].y - 10) < 1e-6,
    "the wire does not meet its poles");
  const middle = pts[4];
  assert.ok(Math.abs(middle.y - 8.5) < 1e-6, `the middle sagged to ${middle.y}, expected 8.5`);
});

test("a wire between poles at different heights still sags below both", () => {
  const pts = sagCurve({ x: 0, y: 10, z: 0 }, { x: 60, y: 14, z: 0 }, 1.5, 8);
  for (let i = 1; i < pts.length - 1; i += 1) {
    const straight = 10 + (14 - 10) * (i / 8);
    assert.ok(pts[i].y < straight, `point ${i} is above the straight line between the poles`);
  }
});

test("explicit heights override the field, for a wire that hangs", () => {
  // A wire's y comes from its own sag curve, not from the ground under it.
  // Given per point, so the caller does not have to reason about how many times
  // the ribbon samples each one — the first version passed a closure with a
  // counter in it, which is a bug waiting for the sampling order to change.
  const pts = line(3, 10);
  const r = ribbon(pts, 0.06, () => 999, { heights: [10, 8, 10] });
  const ys = [];
  for (let i = 0; i < vertexCount(r); i += 1) ys.push(y(r, i));
  assert.ok(Math.min(...ys) === 8 && Math.max(...ys) === 10, `ys ran ${Math.min(...ys)}..${Math.max(...ys)}`);
});

// The defect this file exists for (slice E3).
//
// A ribbon flipped its NORMAL when it came out pointing down and left the
// vertex order alone, so half the streets in the city were lit correctly and
// then culled by the rasteriser — invisible, with a green suite and a rising
// triangle count. Winding is not a detail of the normal; it is the other half
// of the same fact, and every face the addon emits has to agree with itself.
function windingAgreesWithNormals(strip) {
  const p = strip.position;
  const n = strip.normal;
  for (let t = 0; t < strip.triangles; t += 1) {
    const i = t * 9;
    const ux = p[i + 3] - p[i]; const uy = p[i + 4] - p[i + 1]; const uz = p[i + 5] - p[i + 2];
    const vx = p[i + 6] - p[i]; const vy = p[i + 7] - p[i + 1]; const vz = p[i + 8] - p[i + 2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    if (cx * n[i] + cy * n[i + 1] + cz * n[i + 2] <= 0) return t;
  }
  return -1;
}

test("every ribbon face is wound the way its normal points, whichever way the road runs", () => {
  const flat = () => 0;
  // Both directions, because the first version was correct for one of them.
  for (const run of [
    [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 80, z: 20 }],
    [{ x: 80, z: 20 }, { x: 40, z: 0 }, { x: 0, z: 0 }],
    [{ x: 0, z: 0 }, { x: 0, z: 40 }],
    [{ x: 0, z: 40 }, { x: 0, z: 0 }],
  ]) {
    assert.equal(windingAgreesWithNormals(ribbon(run, 4, flat, { lift: 0.02 })), -1);
    assert.equal(windingAgreesWithNormals(ribbon(run, 4, flat, { lift: 0.02, camber: 0.035 })), -1);
    assert.equal(windingAgreesWithNormals(skirt(run, 4, flat, 0.17, { lift: 0.02 })), -1);
  }
});

test("a kerb face points away from the carriageway on both sides", () => {
  const strip = skirt([{ x: 0, z: 0 }, { x: 40, z: 0 }], 4, () => 0, 0.17, {});
  // The road runs along +x, so both kerbs face along z — one each way.
  const zs = new Set();
  for (let t = 0; t < strip.triangles; t += 1) zs.add(Math.sign(strip.normal[t * 9 + 2]));
  assert.deepEqual([...zs].sort(), [-1, 1]);
});

test("a dash that straddles a bend keeps the bend's vertex", () => {
  const bend = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 10 }];
  // Long dashes and no gap, so the second one has to span the corner.
  const runs = dashes(bend, 12, 0);
  const straddler = runs.find((r) => r.length > 2);
  assert.ok(straddler, "no dash spanned the corner");
  assert.ok(straddler.some((p) => p.x === 10 && p.z === 0));
});

test("dashes are the length asked for, and stop before the end of the line", () => {
  const line = [{ x: 0, z: 0 }, { x: 100, z: 0 }];
  const runs = dashes(line, 2, 4);
  assert.equal(runs.length, 17);
  for (const run of runs) {
    assert.ok(Math.abs(Math.hypot(run.at(-1).x - run[0].x, run.at(-1).z - run[0].z) - 2) < 1e-9);
    assert.ok(run.at(-1).x <= 100 + 1e-9);
  }
});

test("a line shorter than one dash gets none", () => {
  assert.deepEqual(dashes([{ x: 0, z: 0 }, { x: 1, z: 0 }], 2, 4), []);
});

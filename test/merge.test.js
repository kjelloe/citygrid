// The geometry merge (slice E2; ruling 039, spec §6.4).
//
// Ruling 039 says the addons are written rather than vendored, and this is the
// one the baker exists for: concatenate the attributes of a pile of
// non-indexed geometries into one buffer so a whole chunk is one draw call.
//
// Pure arithmetic over typed arrays, deliberately: three cannot be resolved in
// node, and the failures worth catching — a matrix applied to positions but not
// to normals, a colour written per geometry instead of per vertex, a `uv` that
// appears on some inputs and not others — are all arithmetic.

import test from "node:test";
import assert from "node:assert/strict";
import { mergeNonIndexed } from "../client/render/merge.js";

/** A unit triangle in the xz plane, normals up. */
function triangle(colour = [1, 1, 1]) {
  return {
    position: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 0, 1]),
    normal: Float32Array.from([0, 1, 0, 0, 1, 0, 0, 1, 0]),
    color: Float32Array.from([...colour, ...colour, ...colour]),
  };
}

/** Column-major 4×4, as three stores them. */
const identity = () => Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function translation(x, y, z) {
  const m = identity();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}
/** A quarter turn about Y: x → −z, z → x. */
function rotationY90() {
  const m = identity();
  m[0] = 0; m[2] = -1; m[8] = 1; m[10] = 0;
  return m;
}

test("two triangles merge into one buffer of six vertices", () => {
  const out = mergeNonIndexed([
    { ...triangle(), matrix: identity() },
    { ...triangle(), matrix: translation(10, 0, 0) },
  ]);
  assert.equal(out.position.length, 18, "six vertices of three floats");
  assert.equal(out.normal.length, 18);
  assert.equal(out.color.length, 18);
  assert.equal(out.triangles, 2);
});

test("a box and a box merge to twenty-four triangles", () => {
  // The item's own arithmetic: two twelve-triangle boxes.
  const box = () => ({
    position: new Float32Array(12 * 3 * 3),
    normal: new Float32Array(12 * 3 * 3),
    color: new Float32Array(12 * 3 * 3),
    matrix: identity(),
  });
  const out = mergeNonIndexed([box(), box()]);
  assert.equal(out.triangles, 24);
});

test("the matrix moves the positions", () => {
  const out = mergeNonIndexed([{ ...triangle(), matrix: translation(5, 2, -3) }]);
  assert.deepEqual([...out.position.slice(0, 3)], [5, 2, -3]);
  assert.deepEqual([...out.position.slice(3, 6)], [6, 2, -3]);
});

test("the matrix rotates the normals WITHOUT translating them", () => {
  // The one that goes wrong quietly: a normal put through the full matrix picks
  // up the translation, every face is lit as though it pointed at the origin,
  // and the picture looks merely "a bit off".
  const m = rotationY90();
  m[12] = 100; m[13] = 100; m[14] = 100;
  const out = mergeNonIndexed([{ ...triangle(), matrix: m }]);
  const n = [...out.normal.slice(0, 3)];
  assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-6, `normal is ${n} — length ${Math.hypot(...n)}`);
  assert.ok(Math.abs(n[1] - 1) < 1e-6, `up became ${n}`);
});

test("a normal survives a rotation as a direction", () => {
  const sideways = {
    position: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normal: Float32Array.from([1, 0, 0, 1, 0, 0, 1, 0, 0]),
    color: new Float32Array(9),
    matrix: rotationY90(),
  };
  const out = mergeNonIndexed([sideways]);
  const n = [...out.normal.slice(0, 3)];
  assert.ok(Math.abs(n[0]) < 1e-6 && Math.abs(n[2] + 1) < 1e-6, `+x became ${n}`);
});

test("colour lands per vertex, not per geometry", () => {
  const out = mergeNonIndexed([
    { ...triangle([1, 0, 0]), matrix: identity() },
    { ...triangle([0, 0, 1]), matrix: identity() },
  ]);
  assert.deepEqual([...out.color.slice(0, 3)], [1, 0, 0]);
  assert.deepEqual([...out.color.slice(9, 12)], [0, 0, 1]);
});

test("uv comes through only when every input has one", () => {
  // Half a uv buffer is worse than none: the vertices without one read whatever
  // was in the array, which is a texture smeared across a wall.
  const withUv = { ...triangle(), uv: Float32Array.from([0, 0, 1, 0, 0, 1]), matrix: identity() };
  const both = mergeNonIndexed([withUv, { ...withUv }]);
  assert.equal(both.uv.length, 12);
  const mixed = mergeNonIndexed([withUv, { ...triangle(), matrix: identity() }]);
  assert.equal(mixed.uv, undefined, "a uv buffer survived an input that had none");
});

test("merging nothing is nothing, not a crash", () => {
  const out = mergeNonIndexed([]);
  assert.equal(out.triangles, 0);
  assert.equal(out.position.length, 0);
});

test("a geometry with no colour gets white rather than zeros", () => {
  // Zeros are black, and a bucket whose material multiplies by vertex colour
  // would render the whole thing invisible.
  const out = mergeNonIndexed([{
    position: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 0, 1]),
    normal: Float32Array.from([0, 1, 0, 0, 1, 0, 0, 1, 0]),
    matrix: identity(),
  }]);
  assert.deepEqual([...out.color.slice(0, 3)], [1, 1, 1]);
});

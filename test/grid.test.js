// Index maths and fixed point. Boring on the surface, and the source of the
// two classic port bugs: transposed axes and floor-versus-truncate on
// negatives.

import test from "node:test";
import assert from "node:assert/strict";
import {
  tileAt, xOf, yOf, inBounds, neighbour, adjacencyMask, DIR4, DIR8,
  manhattan, chebyshev, distance, forEachInRadius, encodeRuns, decodeRuns,
} from "../shared/grid.js";
import { FP, idiv, fdiv, imod, clamp, fpRound, toFp, fpMul, lerp, isqrt } from "../shared/idiv.js";

const W = 64;
const H = 64;

test("index and coordinates round-trip", () => {
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [63, 63], [17, 42]]) {
    const index = tileAt(W, x, y);
    assert.equal(xOf(W, index), x);
    assert.equal(yOf(W, index), y);
  }
});

test("axes are not transposed", () => {
  // The bug this catches looks like nothing until a non-square map appears.
  assert.equal(tileAt(W, 1, 0), 1, "x must advance by one");
  assert.equal(tileAt(W, 0, 1), W, "y must advance by a row");
});

test("bounds exclude the edges correctly", () => {
  assert.ok(inBounds(W, H, 0, 0));
  assert.ok(inBounds(W, H, 63, 63));
  assert.ok(!inBounds(W, H, -1, 0));
  assert.ok(!inBounds(W, H, 0, -1));
  assert.ok(!inBounds(W, H, 64, 0));
  assert.ok(!inBounds(W, H, 0, 64));
});

test("direction order is north, east, south, west — part of the contract", () => {
  assert.deepEqual(DIR4[0], { dx: 0, dy: -1 });
  assert.deepEqual(DIR4[1], { dx: 1, dy: 0 });
  assert.deepEqual(DIR4[2], { dx: 0, dy: 1 });
  assert.deepEqual(DIR4[3], { dx: -1, dy: 0 });
  assert.equal(DIR8.length, 8);
});

test("neighbour returns -1 off the edge rather than wrapping", () => {
  // Wrapping is the failure that produces a road connecting across the map.
  assert.equal(neighbour(W, H, 0, 0, DIR4[3]), -1, "west of the west edge");
  assert.equal(neighbour(W, H, 63, 0, DIR4[1]), -1, "east of the east edge");
  assert.equal(neighbour(W, H, 0, 0, DIR4[1]), tileAt(W, 1, 0));
});

test("adjacency mask packs NESW into bits 1,2,4,8", () => {
  const roads = new Set([tileAt(W, 5, 4), tileAt(W, 6, 5)]);
  const mask = adjacencyMask(W, H, 5, 5, (index) => roads.has(index));
  assert.equal(mask, 0b0011, "north and east");
});

test("adjacency mask treats the edge as absent, not as present", () => {
  const mask = adjacencyMask(W, H, 0, 0, () => true);
  assert.equal(mask, 0b0110, "only east and south exist at the corner");
});

test("distances behave", () => {
  assert.equal(manhattan(0, 0, 3, 4), 7);
  assert.equal(chebyshev(0, 0, 3, 4), 4);
  assert.equal(distance(0, 0, 3, 4), 5, "integer euclidean");
});

test("forEachInRadius clips to the map and reports distance", () => {
  let count = 0;
  let maxDistance = 0;
  forEachInRadius(W, H, 0, 0, 2, (index, x, y, d) => {
    count += 1;
    maxDistance = Math.max(maxDistance, d);
    assert.ok(inBounds(W, H, x, y));
  });
  assert.equal(count, 9, "a corner sees a quarter of the 5x5 square");
  assert.ok(maxDistance <= 3);
});

test("run-length encoding round-trips and compresses a drag", () => {
  const drag = [];
  for (let i = 100; i < 500; i += 1) drag.push(i);
  const runs = encodeRuns(drag);
  assert.deepEqual(runs, [100, 400], "400 contiguous tiles become one run");
  assert.deepEqual(decodeRuns(runs), drag);
});

test("run-length encoding handles gaps, duplicates and disorder", () => {
  const runs = encodeRuns([5, 3, 4, 9, 3]);
  assert.deepEqual(decodeRuns(runs), [3, 4, 5, 9]);
});

test("run-length encoding of nothing is nothing", () => {
  assert.deepEqual(encodeRuns([]), []);
  assert.deepEqual(decodeRuns([]), []);
});

test("idiv truncates toward zero, including for negatives", () => {
  // Floor-division on signed values broke mirror symmetry in a sibling
  // project. The asymmetry only appears for negatives, which is where it
  // hides longest.
  assert.equal(idiv(7, 2), 3);
  assert.equal(idiv(-7, 2), -3, "truncate, not floor");
  assert.equal(fdiv(-7, 2), -4, "fdiv is the explicit floor");
});

test("imod is never negative", () => {
  assert.equal(imod(7, 4), 3);
  assert.equal(imod(-1, 4), 3, "% would give -1");
  assert.equal(imod(-5, 4), 3);
});

test("clamp holds both ends", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});

test("fixed point stays integral through a round trip", () => {
  assert.equal(FP, 256);
  assert.equal(toFp(3), 768);
  assert.equal(fpRound(toFp(3)), 3);
  assert.equal(fpRound(toFp(1) + 128), 2, "half rounds away from zero");
  assert.equal(fpRound(-(toFp(1) + 128)), -2, "and symmetrically for negatives");
});

test("fixed-point multiply approximates a fraction without floats", () => {
  const threeQuarters = idiv(FP * 3, 4);
  assert.equal(fpMul(toFp(100), threeQuarters), toFp(75));
});

test("lerp interpolates on integers", () => {
  assert.equal(lerp(0, 100, 0), 0);
  assert.equal(lerp(0, 100, FP), 100);
  assert.equal(lerp(0, 100, idiv(FP, 2)), 50);
});

test("isqrt is the floor of the square root", () => {
  assert.equal(isqrt(0), 0);
  assert.equal(isqrt(1), 1);
  assert.equal(isqrt(15), 3);
  assert.equal(isqrt(16), 4);
  assert.equal(isqrt(1000000), 1000);
  assert.equal(isqrt(-5), 0, "negative input is clamped, not looped forever");
});

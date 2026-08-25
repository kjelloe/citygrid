// Index and coordinate maths. Nothing anywhere computes `y * width + x` by
// hand — 0-versus-1 indexing and transposed axes are the classic port killers,
// and a named helper is the only defence that survives a refactor.

import { fdiv, isqrt } from "./idiv.js";

export function tileAt(width, x, y) {
  return y * width + x;
}

export function xOf(width, index) {
  return index % width;
}

export function yOf(width, index) {
  return fdiv(index, width);
}

export function inBounds(width, height, x, y) {
  return x >= 0 && y >= 0 && x < width && y < height;
}

/** North, east, south, west — in that order, always. Iteration order is part
 * of the determinism contract: change it and every seeded map changes. */
export const DIR4 = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

export const DIR8 = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
];

/** Neighbour index, or -1 off the edge. Returning -1 rather than undefined
 * keeps callers integer-typed, which matters for a Luau twin. */
export function neighbour(width, height, x, y, dir) {
  const nx = x + dir.dx;
  const ny = y + dir.dy;
  if (!inBounds(width, height, nx, ny)) return -1;
  return tileAt(width, nx, ny);
}

/** The 4-neighbour bitmask used for auto-connecting roads, wires and pipes:
 * north 1, east 2, south 4, west 8. Sixteen shapes, one lookup. */
export function adjacencyMask(width, height, x, y, predicate) {
  let mask = 0;
  for (let i = 0; i < DIR4.length; i += 1) {
    const index = neighbour(width, height, x, y, DIR4[i]);
    if (index >= 0 && predicate(index)) mask |= 1 << i;
  }
  return mask;
}

export function manhattan(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

export function chebyshev(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Integer euclidean distance, for coverage radii that should look circular
 * rather than square. */
export function distance(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return isqrt(dx * dx + dy * dy);
}

/** Visits every tile within a square radius, clipped to the map. The callback
 * receives (index, x, y, distance). */
export function forEachInRadius(width, height, cx, cy, radius, visit) {
  const x0 = Math.max(0, cx - radius);
  const x1 = Math.min(width - 1, cx + radius);
  const y0 = Math.max(0, cy - radius);
  const y1 = Math.min(height - 1, cy + radius);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      visit(tileAt(width, x, y), x, y, distance(cx, cy, x, y));
    }
  }
}

/** Run-length encodes a sorted list of tile indices. Drag-paint crosses the
 * wire this way: 400 contiguous tiles become a handful of runs, which is the
 * single biggest multiplayer load lever there is. */
export function encodeRuns(indices) {
  const sorted = [...indices].sort((a, b) => a - b);
  const runs = [];
  let start = -1;
  let previous = -2;
  for (const index of sorted) {
    if (index === previous) continue;
    if (index !== previous + 1) {
      if (start >= 0) runs.push(start, previous - start + 1);
      start = index;
    }
    previous = index;
  }
  if (start >= 0) runs.push(start, previous - start + 1);
  return runs;
}

export function decodeRuns(runs) {
  const indices = [];
  for (let i = 0; i < runs.length; i += 2) {
    const start = runs[i];
    const length = runs[i + 1];
    for (let k = 0; k < length; k += 1) indices.push(start + k);
  }
  return indices;
}

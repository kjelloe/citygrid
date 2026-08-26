// Procedural building and prop geometry.
//
// The first pass drew every building as one box, and a city of identical boxes
// reads as a chart, not a place. This builds real shapes — pitched roofs,
// parapets, chimneys, awnings, sawtooth factory roofs — in several variants
// per category, so that neighbouring buildings differ the way they do in the
// transport-world reference.
//
// Everything is authored at UNIT HEIGHT with the roof as a proportion of it,
// so the instance's Y scale still sets how tall a building is and the roof
// stays in proportion. Footprint is in the geometry; height is in the matrix.
//
// Shading is baked into vertex colours per face, which keeps every variant on
// one material and lets the unlit pixel style read as solid.

import * as THREE from "three";

// --- a tiny mesh builder ----------------------------------------------------

function makeParts() {
  return { position: [], normal: [], colour: [] };
}

function pushTri(parts, a, b, c, shade) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  for (const v of [a, b, c]) {
    parts.position.push(v[0], v[1], v[2]);
    parts.normal.push(nx, ny, nz);
    parts.colour.push(shade, shade, shade);
  }
}

function pushQuad(parts, a, b, c, d, shade) {
  pushTri(parts, a, b, c, shade);
  pushTri(parts, a, c, d, shade);
}

/** Face shades. Top brightest, then the two side pairs, so a building reads as
 * solid even with no light on it at all. */
const TOP = 1.0;
const SOUTH = 0.88;
const NORTH = 0.7;
const EAST = 0.8;
const WEST = 0.62;

function addBox(parts, x0, y0, z0, x1, y1, z1, tint = 1) {
  const p = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ];
  pushQuad(parts, p[4], p[7], p[6], p[5], TOP * tint);        // top
  pushQuad(parts, p[0], p[1], p[2], p[3], NORTH * 0.5 * tint); // bottom
  pushQuad(parts, p[0], p[4], p[5], p[1], NORTH * tint);       // -z
  pushQuad(parts, p[3], p[2], p[6], p[7], SOUTH * tint);       // +z
  pushQuad(parts, p[1], p[5], p[6], p[2], EAST * tint);        // +x
  pushQuad(parts, p[0], p[3], p[7], p[4], WEST * tint);        // -x
}

/** A pitched roof: a prism ridged along X or Z. */
function addGable(parts, x0, y0, z0, x1, y1, z1, alongX, tint = 1) {
  if (alongX) {
    const zm = (z0 + z1) / 2;
    const ridgeA = [x0, y1, zm];
    const ridgeB = [x1, y1, zm];
    pushQuad(parts, [x0, y0, z0], [x1, y0, z0], ridgeB, ridgeA, NORTH * tint);
    pushQuad(parts, [x1, y0, z1], [x0, y0, z1], ridgeA, ridgeB, SOUTH * tint);
    pushTri(parts, [x0, y0, z0], ridgeA, [x0, y0, z1], WEST * tint);
    pushTri(parts, [x1, y0, z1], ridgeB, [x1, y0, z0], EAST * tint);
  } else {
    const xm = (x0 + x1) / 2;
    const ridgeA = [xm, y1, z0];
    const ridgeB = [xm, y1, z1];
    pushQuad(parts, [x0, y0, z0], ridgeA, ridgeB, [x0, y0, z1], WEST * tint);
    pushQuad(parts, [x1, y0, z1], ridgeB, ridgeA, [x1, y0, z0], EAST * tint);
    pushTri(parts, [x0, y0, z0], [x1, y0, z0], ridgeA, NORTH * tint);
    pushTri(parts, [x0, y0, z1], ridgeB, [x1, y0, z1], SOUTH * tint);
  }
}

/** A faceted cone, for conifers. Few sides on purpose — the reference's trees
 * are visibly faceted and that is most of their charm. */
function addCone(parts, cx, y0, cz, radius, y1, sides, tint = 1) {
  const apex = [cx, y1, cz];
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * Math.PI * 2;
    const b = ((i + 1) / sides) * Math.PI * 2;
    const p1 = [cx + Math.cos(a) * radius, y0, cz + Math.sin(a) * radius];
    const p2 = [cx + Math.cos(b) * radius, y0, cz + Math.sin(b) * radius];
    const shade = (0.66 + 0.34 * (0.5 + 0.5 * Math.cos(a))) * tint;
    pushTri(parts, p1, p2, apex, shade);
    pushTri(parts, [cx, y0, cz], p2, p1, NORTH * 0.5 * tint);
  }
}

/** A faceted blob, for broadleaf canopies. */
function addBlob(parts, cx, cy, cz, radius, sides, tint = 1) {
  const rings = 3;
  for (let r = 0; r < rings; r += 1) {
    const y0 = cy + (r / rings) * radius * 2 - radius;
    const y1 = cy + ((r + 1) / rings) * radius * 2 - radius;
    const r0 = Math.sqrt(Math.max(0, radius * radius - (y0 - cy) * (y0 - cy)));
    const r1 = Math.sqrt(Math.max(0, radius * radius - (y1 - cy) * (y1 - cy)));
    for (let i = 0; i < sides; i += 1) {
      const a = (i / sides) * Math.PI * 2;
      const b = ((i + 1) / sides) * Math.PI * 2;
      const shade = (0.6 + 0.4 * (0.5 + 0.5 * Math.cos(a)) + (r / rings) * 0.15) * tint;
      const A = [cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0];
      const B = [cx + Math.cos(b) * r0, y0, cz + Math.sin(b) * r0];
      const C = [cx + Math.cos(b) * r1, y1, cz + Math.sin(b) * r1];
      const D = [cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1];
      pushQuad(parts, A, B, C, D, Math.min(1, shade));
    }
  }
}

function finish(parts) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(parts.position), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(parts.normal), 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(parts.colour), 3));
  geometry.computeBoundingSphere();
  return geometry;
}

// --- building variants ------------------------------------------------------

const W = 0.42; // half-width of a one-tile building, leaving a margin

/** Houses: pitched roof, a chimney, a doorstep. Four silhouettes. */
function residential(variant) {
  const parts = makeParts();
  const eave = 0.62;
  const alongX = variant % 2 === 0;

  if (variant === 3) {
    // L-shaped cottage: two wings, two ridges.
    addBox(parts, -W, 0, -W, 0.05, eave, W);
    addGable(parts, -W - 0.04, eave, -W - 0.04, 0.09, 1.0, W + 0.04, false, 0.82);
    addBox(parts, 0.05, 0, -0.05, W, eave * 0.86, W);
    addGable(parts, 0.01, eave * 0.86, -0.09, W + 0.04, 0.92, W + 0.04, true, 0.82);
  } else if (variant === 2) {
    // Wide bungalow with a shallow roof and a porch.
    addBox(parts, -W, 0, -W * 0.8, W, eave * 0.8, W * 0.8);
    addGable(parts, -W - 0.05, eave * 0.8, -W * 0.8 - 0.05, W + 0.05, 0.9, W * 0.8 + 0.05, true, 0.82);
    addBox(parts, -W * 0.5, 0, W * 0.8, W * 0.5, eave * 0.55, W);
  } else {
    addBox(parts, -W, 0, -W, W, eave, W);
    addGable(parts, -W - 0.05, eave, -W - 0.05, W + 0.05, 1.0, W + 0.05, alongX, 0.82);
    // Doorstep, so the front of the building reads at ground level.
    addBox(parts, -0.1, 0, W, 0.1, 0.08, W + 0.08, 0.75);
  }

  // Chimney, offset per variant so a row of houses is not a row of clones.
  const cx = variant === 1 ? -W * 0.55 : W * 0.5;
  addBox(parts, cx - 0.06, eave * 0.9, -W * 0.35, cx + 0.06, 1.12, -W * 0.35 + 0.12, 0.6);
  return finish(parts);
}

/** Shops and offices: flat roofs, parapets, awnings, roof clutter. */
function commercial(variant) {
  const parts = makeParts();
  const top = 0.9;

  addBox(parts, -W, 0, -W, W, top, W);
  // Parapet: a lip around the roof, which is what makes a flat-roofed block
  // read as a building rather than as a brick.
  addBox(parts, -W - 0.03, top, -W - 0.03, W + 0.03, top + 0.07, W + 0.03, 0.7);

  if (variant === 0 || variant === 2) {
    // Awning over the shopfront.
    addBox(parts, -W, top * 0.42, W, W, top * 0.5, W + 0.14, 0.66);
  }
  if (variant === 1) {
    // A setback upper storey.
    addBox(parts, -W * 0.7, top + 0.07, -W * 0.7, W * 0.7, top + 0.34, W * 0.7, 0.92);
    addBox(parts, -W * 0.73, top + 0.34, -W * 0.73, W * 0.73, top + 0.4, W * 0.73, 0.7);
  }
  if (variant === 3) {
    // Rooftop plant and a sign.
    addBox(parts, -W * 0.4, top + 0.07, -W * 0.3, W * 0.1, top + 0.2, W * 0.2, 0.62);
    addBox(parts, W * 0.3, top + 0.07, -W * 0.2, W * 0.42, top + 0.32, W * 0.2, 0.55);
  }
  return finish(parts);
}

/** Works and warehouses: sawtooth roofs, stacks, loading bays. */
function industrial(variant) {
  const parts = makeParts();
  const top = 0.72;
  addBox(parts, -W, 0, -W, W, top, W);

  if (variant === 0 || variant === 2) {
    // Sawtooth roof: the profile of every factory ever drawn.
    const teeth = 3;
    for (let i = 0; i < teeth; i += 1) {
      const z0 = -W + (i / teeth) * (W * 2);
      const z1 = -W + ((i + 1) / teeth) * (W * 2);
      pushQuad(parts,
        [-W, top, z0], [W, top, z0], [W, top + 0.16, z1 - 0.01], [-W, top + 0.16, z1 - 0.01], 0.86);
      pushQuad(parts,
        [-W, top, z1], [-W, top + 0.16, z1 - 0.01], [W, top + 0.16, z1 - 0.01], [W, top, z1], 0.58);
    }
  } else {
    addBox(parts, -W - 0.03, top, -W - 0.03, W + 0.03, top + 0.06, W + 0.03, 0.7);
  }

  // Chimney stacks — the tallest thing in an industrial district, and the
  // reason a factory reads from across the map.
  const stacks = variant === 1 ? 2 : 1;
  for (let i = 0; i < stacks; i += 1) {
    const sx = stacks === 1 ? W * 0.5 : -W * 0.45 + i * W * 0.9;
    addBox(parts, sx - 0.055, top, -W * 0.5, sx + 0.055, 1.25 + i * 0.08, -W * 0.5 + 0.11, 0.52);
  }
  if (variant === 3) {
    // Loading bay canopy.
    addBox(parts, -W, top * 0.3, W, W * 0.2, top * 0.38, W + 0.16, 0.6);
  }
  return finish(parts);
}

/** Civic and utility: bigger, plainer, with something on the roof so they read
 * as institutional rather than as a large shop. */
function civic(variant) {
  const parts = makeParts();
  const top = 0.8;
  addBox(parts, -W, 0, -W, W, top, W);
  addBox(parts, -W - 0.04, top, -W - 0.04, W + 0.04, top + 0.08, W + 0.04, 0.72);
  if (variant === 0) {
    // A tower — a station, a hall, something with a clock.
    addBox(parts, -0.1, top + 0.08, -0.1, 0.1, top + 0.42, 0.1, 0.9);
    addGable(parts, -0.13, top + 0.42, -0.13, 0.13, top + 0.58, 0.13, true, 0.66);
  } else if (variant === 1) {
    // Vents and a mast.
    addBox(parts, -W * 0.5, top + 0.08, -W * 0.4, -W * 0.1, top + 0.22, W * 0.1, 0.62);
    addBox(parts, W * 0.3, top + 0.08, 0, W * 0.36, top + 0.5, 0.06, 0.55);
  } else {
    addBox(parts, -W * 0.6, top + 0.08, -W * 0.6, W * 0.6, top + 0.18, W * 0.6, 0.86);
  }
  return finish(parts);
}

/** Trees. Three shapes, because a forest of one tree is a texture. */
function tree(variant) {
  const parts = makeParts();
  addBox(parts, -0.035, 0, -0.035, 0.035, 0.3, 0.035, 0.5); // trunk
  if (variant === 0) addCone(parts, 0, 0.18, 0, 0.24, 0.95, 7);
  else if (variant === 1) addBlob(parts, 0, 0.52, 0, 0.26, 7);
  else {
    addCone(parts, 0, 0.16, 0, 0.26, 0.6, 6);
    addCone(parts, 0, 0.42, 0, 0.19, 0.88, 6, 0.92);
  }
  return finish(parts);
}

export const VARIANTS = 4;
export const TREE_VARIANTS = 3;

export function buildingVariants(kind) {
  const make = kind === "residential" ? residential
    : kind === "commercial" ? commercial
      : kind === "industrial" ? industrial
        : civic;
  const list = [];
  for (let i = 0; i < VARIANTS; i += 1) list.push(make(i));
  return list;
}

export function treeVariants() {
  const list = [];
  for (let i = 0; i < TREE_VARIANTS; i += 1) list.push(tree(i));
  return list;
}

/** Which variant a building gets. Deterministic from its id, so a building
 * keeps its shape for its whole life and two clients agree on what it looks
 * like without the shape ever entering game state. */
export function variantFor(id, count) {
  let h = (id * 2654435761) >>> 0;
  h ^= h >>> 15;
  return h % count;
}

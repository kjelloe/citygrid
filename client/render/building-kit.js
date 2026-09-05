// Procedural building and prop geometry.
//
// A city of identical boxes reads as a chart, not a place. This builds real
// shapes — pitched roofs, parapets, chimneys, awnings, sawtooth factory roofs
// — and then covers them in the detail the reference images actually earn
// their charm from: rows of windows, a door with a step, balcony rails, air
// conditioners and water tanks on the roof, shop signs, garden fences.
//
// Everything is authored at UNIT HEIGHT with the roof as a proportion of it,
// so the instance's Y scale still sets how tall a building is. Footprint is in
// the geometry; height is in the matrix.
//
// Shading is baked into vertex colours per face, which keeps every variant on
// one material and lets the unlit pixel style read as solid.

import * as THREE from "three";
import {
  pushTri, pushQuad, addBox, addPanel, addWindowGrid, addDoor, addBalcony,
  addRoofClutter, addShopfront, addFence, addDormers,
} from "./detail-kit.js";
import { variantFor } from "../world/params.js";

const TOP = 1.0;
const SOUTH = 0.88;
const NORTH = 0.7;
const EAST = 0.8;
const WEST = 0.62;

// A building is built into TWO buffers, walls and roof, so the two can be
// drawn as separate instanced meshes with independent colours. A roof that is
// only a darkened wall gives a cream house a cream-brown roof; the reference
// gets most of its charm from terracotta and slate roofs ABOVE cream walls,
// and that is a different hue, not a lower brightness (ruling 021).
//
// The switch is a swap of which arrays `parts` points at, so every existing
// helper writes to the roof without knowing the roof exists.
function makeParts() {
  const walls = { position: [], normal: [], colour: [] };
  const roof = { position: [], normal: [], colour: [] };
  return { ...walls, walls, roof };
}

function pointAt(parts, buffer) {
  parts.position = buffer.position;
  parts.normal = buffer.normal;
  parts.colour = buffer.colour;
}

/** Everything `build` adds goes into the roof buffer. */
function roofPart(parts, build) {
  pointAt(parts, parts.roof);
  build();
  pointAt(parts, parts.walls);
}

/** A pitched roof: a prism ridged along X or Z, with a visible eave overhang. */
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

/** A roof built as a stack of shrinking slabs rather than a smooth slope.
 *
 * This is the single most recognisable thing about the reference: its hipped
 * roofs terrace, so a red roof reads as three or four bands of red rather than
 * one flat plane. A smooth prism at this camera angle reads as a wedge, which
 * is why ours looked like massing studies next to it.
 *
 * `alongX` keeps the ridge, shrinking only across it. Steps cost about 12
 * triangles each, so this is FULL tier only — at SHAPE the terracing is
 * smaller than a pixel and `addGable` does the job for a fifth of the cost. */
function addSteppedGable(parts, x0, y0, z0, x1, y1, z1, alongX, steps = 3) {
  const midX = (x0 + x1) / 2;
  const midZ = (z0 + z1) / 2;
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const ya = y0 + (y1 - y0) * t0;
    const yb = y0 + (y1 - y0) * t1;
    // Shrink across the ridge every step; along it only at the ends, which is
    // what separates a hip from a gable.
    const shrink = (lo, hi, mid, t) => [lo + (mid - lo) * t, hi + (mid - hi) * t];
    const [ax, bx] = alongX ? shrink(x0, x1, midX, t0 * 0.22) : shrink(x0, x1, midX, t0);
    const [az, bz] = alongX ? shrink(z0, z1, midZ, t0) : shrink(z0, z1, midZ, t0 * 0.22);
    addBox(parts, ax, ya, az, bx, yb, bz);
  }
}

/** Stepped when anyone can see the steps, smooth when they cannot. */
function pitchedRoof(parts, x0, y0, z0, x1, y1, z1, alongX, detail) {
  if (detail > 1) addSteppedGable(parts, x0, y0, z0, x1, y1, z1, alongX);
  else addGable(parts, x0, y0, z0, x1, y1, z1, alongX);
}

function addCone(parts, cx, y0, cz, radius, y1, sides, tint = 1) {
  const apex = [cx, y1, cz];
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * Math.PI * 2;
    const b = ((i + 1) / sides) * Math.PI * 2;
    const p1 = [cx + Math.cos(a) * radius, y0, cz + Math.sin(a) * radius];
    const p2 = [cx + Math.cos(b) * radius, y0, cz + Math.sin(b) * radius];
    pushTri(parts, p1, p2, apex, (0.66 + 0.34 * (0.5 + 0.5 * Math.cos(a))) * tint);
    pushTri(parts, [cx, y0, cz], p2, p1, NORTH * 0.5 * tint);
  }
}

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
      const shade = Math.min(1, (0.6 + 0.4 * (0.5 + 0.5 * Math.cos(a)) + (r / rings) * 0.15) * tint);
      pushQuad(parts,
        [cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0],
        [cx + Math.cos(b) * r0, y0, cz + Math.sin(b) * r0],
        [cx + Math.cos(b) * r1, y1, cz + Math.sin(b) * r1],
        [cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1], shade);
    }
  }
}

function toGeometry(buffer) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(buffer.position), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(buffer.normal), 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(buffer.colour), 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Props have no roof and stay one mesh. */
function finish(parts) {
  return toGeometry(parts.walls);
}

/** Buildings come out as a pair. The roof is undefined when a form has none,
 * so the caller never allocates an empty mesh. */
function finishBuilding(parts) {
  return {
    walls: toGeometry(parts.walls),
    roof: parts.roof.position.length > 0 ? toGeometry(parts.roof) : undefined,
  };
}

const W = 0.45;

/** The coarsest tier: a box with a roof-coloured cap. At the zoom where this is
 * used a building is a handful of pixels, and this is all of it anyone can
 * see. 36 triangles against 620. */
function blockForm(parts, height, pitched) {
  addBox(parts, -W, 0, -W, W, height * 0.78, W);
  roofPart(parts, () => {
    if (pitched) addGable(parts, -W - 0.04, height * 0.78, -W - 0.04, W + 0.04, height, W + 0.04, true);
    else addBox(parts, -W - 0.03, height * 0.78, -W - 0.03, W + 0.03, height * 0.84, W + 0.03);
  });
  return finishBuilding(parts);
}

// Roof geometry is no longer tinted towards dark: it carries its own instance
// colour now, so a tint here would only darken a colour that was already
// chosen. Face shading still applies, which is what keeps a ridge readable.

// --- residential ------------------------------------------------------------

function residential(variant, detail) {
  const parts = makeParts();
  const seed = 100 + variant * 17;
  const eave = 0.68;
  if (detail === 0) return blockForm(parts, 1.0, true);

  if (variant === 3) {
    // L-shaped cottage: two wings, two ridges, windows on both.
    addBox(parts, -W, 0, -W, 0.05, eave, W);
    addBox(parts, 0.05, 0, -0.05, W, eave * 0.85, W);
    roofPart(parts, () => {
      pitchedRoof(parts, -W - 0.05, eave, -W - 0.05, 0.1, 1.0, W + 0.05, false, detail);
      pitchedRoof(parts, 0.0, eave * 0.85, -0.1, W + 0.05, 0.9, W + 0.05, true, detail);
    });
    if (detail > 1) addWindowGrid(parts, 2, W, W, { from: 0.1, to: eave * 0.8, columns: 3, rows: 2 });
    if (detail > 1) addWindowGrid(parts, 3, W, W, { from: 0.1, to: eave * 0.8, columns: 2, rows: 2 });
    if (detail > 1) addDoor(parts, W, 0.09, 0.2);
  } else if (variant === 2) {
    // Bungalow with a porch and dormers.
    addBox(parts, -W, 0, -W * 0.82, W, eave * 0.8, W * 0.82);
    roofPart(parts, () => {
      pitchedRoof(parts, -W - 0.06, eave * 0.8, -W * 0.82 - 0.06, W + 0.06, 0.92, W * 0.82 + 0.06, true, detail);
      if (detail > 1) addDormers(parts, W * 0.7, eave * 0.8, 0.92, 2, seed);
      // The porch roof is roofing, and reads wrong in wall colour.
      addBox(parts, -W * 0.55, eave * 0.55, W * 0.82, W * 0.55, eave * 0.6, W, 0.95);
    });
    addBox(parts, -W * 0.52, 0, W - 0.03, -W * 0.46, eave * 0.55, W, 0.6);
    addBox(parts, W * 0.46, 0, W - 0.03, W * 0.52, eave * 0.55, W, 0.6);
    if (detail > 1) addWindowGrid(parts, 2, W * 0.82, W, { from: 0.1, to: eave * 0.62, columns: 3, rows: 1 });
    if (detail > 1) addWindowGrid(parts, 1, W, W * 0.82, { from: 0.1, to: eave * 0.62, columns: 2, rows: 1 });
    if (detail > 1) addDoor(parts, W * 0.82, 0.085, 0.19);
  } else {
    // Two-storey terrace with a balcony on the upper floor.
    addBox(parts, -W, 0, -W, W, eave, W);
    roofPart(parts, () => pitchedRoof(parts, -W - 0.06, eave, -W - 0.06, W + 0.06, 1.0, W + 0.06, variant === 0, detail));
    if (detail > 1) addWindowGrid(parts, 2, W, W, { from: 0.08, to: eave - 0.04, columns: 3, rows: 2 });
    if (detail > 1) addWindowGrid(parts, 0, W, W, { from: 0.08, to: eave - 0.04, columns: 3, rows: 2 });
    if (detail > 1) addWindowGrid(parts, 1, W, W, { from: 0.08, to: eave - 0.04, columns: 2, rows: 2 });
    if (detail > 1) addWindowGrid(parts, 3, W, W, { from: 0.08, to: eave - 0.04, columns: 2, rows: 2 });
    if (variant === 1) addBalcony(parts, W, eave * 0.55, W * 0.55);
    if (detail > 1) addDoor(parts, W);
    if (variant === 0) roofPart(parts, () => addDormers(parts, W * 0.8, eave, 1.0, 1, seed));
  }

  // Chimney, offset per variant so a row of houses is not a row of clones.
  const cx = variant === 1 ? -W * 0.55 : W * 0.5;
  addBox(parts, cx - 0.055, eave * 0.88, -W * 0.35, cx + 0.055, 1.13, -W * 0.35 + 0.11, 0.58);
  addBox(parts, cx - 0.07, 1.13, -W * 0.35 - 0.012, cx + 0.07, 1.155, -W * 0.35 + 0.122, 0.5);
  // A garden fence: suburbs read as suburbs because of boundaries.
  if (variant !== 3) addFence(parts, W + 0.035, 0.05, 0.78);
  return finishBuilding(parts);
}

// --- commercial -------------------------------------------------------------

function commercial(variant, detail) {
  const parts = makeParts();
  const seed = 300 + variant * 23;
  const top = 0.9;
  if (detail === 0) return blockForm(parts, 0.97, false);

  addBox(parts, -W, 0, -W, W, top, W);
  roofPart(parts, () => addBox(parts, -W - 0.035, top, -W - 0.035, W + 0.035, top + 0.07, W + 0.035));

  // Storey bands of windows all round — the strongest single cue that a block
  // is an office and not a warehouse.
  const rows = variant === 1 ? 4 : 3;
  if (detail > 1) for (const side of [0, 1, 2, 3]) {
    addWindowGrid(parts, side, W, W, {
      from: 0.24, to: top - 0.05, columns: side % 2 === 0 ? 4 : 3, rows,
      windowShade: 0.3, sillShade: 1.22,
    });
  }
  // Ground floor is glazed: one long shopfront window rather than a grid.
  if (detail > 1) addPanel(parts, 2, W, -W * 0.86, 0.05, W * 0.86, 0.2, 0.28);
  if (detail > 1) addPanel(parts, 0, W, -W * 0.86, 0.05, W * 0.86, 0.2, 0.28);

  if (variant === 0 || variant === 2) addShopfront(parts, W, 0.21, W * 0.9);
  if (variant === 1) {
    addBox(parts, -W * 0.72, top + 0.07, -W * 0.72, W * 0.72, top + 0.36, W * 0.72, 0.94);
    roofPart(parts, () => addBox(parts, -W * 0.75, top + 0.36, -W * 0.75, W * 0.75, top + 0.42, W * 0.75));
    if (detail > 1) addWindowGrid(parts, 2, W * 0.72, W * 0.72, { from: top + 0.12, to: top + 0.32, columns: 3, rows: 1 });
  }
  if (variant === 3) {
    // A sign board standing above the parapet.
    addBox(parts, -W * 0.5, top + 0.07, -0.02, W * 0.5, top + 0.28, 0.02, 1.3);
    addBox(parts, -W * 0.5, top + 0.07, -0.05, -W * 0.44, top + 0.28, 0.05, 0.6);
    addBox(parts, W * 0.44, top + 0.07, -0.05, W * 0.5, top + 0.28, 0.05, 0.6);
  }
  if (detail > 1) roofPart(parts, () => addRoofClutter(parts, W, top + 0.07, seed));
  return finishBuilding(parts);
}

// --- industrial -------------------------------------------------------------

function industrial(variant, detail) {
  const parts = makeParts();
  const seed = 500 + variant * 29;
  const top = 0.72;
  if (detail === 0) return blockForm(parts, 0.78, false);
  addBox(parts, -W, 0, -W, W, top, W);

  if (variant === 0 || variant === 2) {
    roofPart(parts, () => {
      const teeth = 3;
      for (let i = 0; i < teeth; i += 1) {
        const z0 = -W + (i / teeth) * (W * 2);
        const z1 = -W + ((i + 1) / teeth) * (W * 2);
        pushQuad(parts, [-W, top, z0], [W, top, z0], [W, top + 0.16, z1 - 0.01], [-W, top + 0.16, z1 - 0.01], 1);
        // The glazed face of each sawtooth, which is what they are for.
        pushQuad(parts, [-W, top, z1], [-W, top + 0.16, z1 - 0.01], [W, top + 0.16, z1 - 0.01], [W, top, z1], 0.32);
      }
    });
  } else {
    roofPart(parts, () => {
      addBox(parts, -W - 0.035, top, -W - 0.035, W + 0.035, top + 0.06, W + 0.035);
      if (detail > 1) addRoofClutter(parts, W, top + 0.06, seed);
    });
  }

  // High windows only: a works has a blank lower wall and glass near the roof.
  if (detail > 1) for (const side of [0, 1, 2, 3]) {
    addWindowGrid(parts, side, W, W, {
      from: top * 0.62, to: top - 0.06, columns: side % 2 === 0 ? 5 : 4, rows: 1,
      windowShade: 0.3, sills: false,
    });
  }

  const stacks = variant === 1 ? 2 : 1;
  for (let i = 0; i < stacks; i += 1) {
    const sx = stacks === 1 ? W * 0.5 : -W * 0.45 + i * W * 0.9;
    addBox(parts, sx - 0.05, top, -W * 0.5, sx + 0.05, 1.25 + i * 0.08, -W * 0.5 + 0.1, 0.5);
    addBox(parts, sx - 0.062, 1.25 + i * 0.08, -W * 0.5 - 0.012, sx + 0.062, 1.28 + i * 0.08, -W * 0.5 + 0.112, 0.42);
  }
  if (variant === 3) {
    // Loading bay: canopy, and two roller doors under it.
    addBox(parts, -W, top * 0.3, W, W * 0.25, top * 0.38, W + 0.16, 0.6);
    if (detail > 1) addPanel(parts, 2, W, -W * 0.9, 0.005, -W * 0.35, top * 0.28, 0.36);
    if (detail > 1) addPanel(parts, 2, W, -W * 0.25, 0.005, W * 0.2, top * 0.28, 0.36);
  } else {
    if (detail > 1) addDoor(parts, W, 0.075, 0.16, 0.36);
  }
  // Yard fence, because a works has a boundary.
  if (detail > 1) addFence(parts, W + 0.04, 0.06, 0.6);
  return finishBuilding(parts);
}

// --- civic ------------------------------------------------------------------

function civic(variant, detail) {
  const parts = makeParts();
  const seed = 700 + variant * 31;
  const top = 0.8;
  if (detail === 0) return blockForm(parts, 0.88, false);
  addBox(parts, -W, 0, -W, W, top, W);
  roofPart(parts, () => addBox(parts, -W - 0.045, top, -W - 0.045, W + 0.045, top + 0.08, W + 0.045));

  if (detail > 1) for (const side of [0, 1, 2, 3]) {
    addWindowGrid(parts, side, W, W, {
      from: 0.22, to: top - 0.06, columns: side % 2 === 0 ? 4 : 3, rows: 2, windowShade: 0.32,
    });
  }
  // A civic entrance: wide doors and a portico.
  if (detail > 1) addPanel(parts, 2, W, -0.14, 0.005, 0.14, 0.24, 0.38);
  addBox(parts, -0.2, 0.26, W, 0.2, 0.3, W + 0.09, 0.78);
  addBox(parts, -0.19, 0, W + 0.05, -0.15, 0.26, W + 0.09, 0.66);
  addBox(parts, 0.15, 0, W + 0.05, 0.19, 0.26, W + 0.09, 0.66);
  addBox(parts, -0.24, 0, W, 0.24, 0.025, W + 0.11, 0.85);

  if (variant === 0) {
    addBox(parts, -0.1, top + 0.08, -0.1, 0.1, top + 0.44, 0.1, 0.92);
    if (detail > 1) addPanel(parts, 2, 0.1, -0.05, top + 0.2, 0.05, top + 0.34, 1.3);
    roofPart(parts, () => addGable(parts, -0.135, top + 0.44, -0.135, 0.135, top + 0.6, 0.135, true));
  } else if (variant === 1) {
    addBox(parts, W * 0.3, top + 0.08, -0.03, W * 0.36, top + 0.52, 0.03, 0.55);
    if (detail > 1) roofPart(parts, () => addRoofClutter(parts, W, top + 0.08, seed));
  } else {
    addBox(parts, -W * 0.62, top + 0.08, -W * 0.62, W * 0.62, top + 0.18, W * 0.62, 0.88);
    if (detail > 1) roofPart(parts, () => addRoofClutter(parts, W * 0.6, top + 0.18, seed));
  }
  return finishBuilding(parts);
}

// --- props ------------------------------------------------------------------

function tree(variant, detail) {
  const parts = makeParts();
  if (detail < 2) {
    // A trunk and one four-sided cone. From above, at the zoom this is used
    // at, a tree is a green triangle and nothing more.
    addBox(parts, -0.03, 0, -0.03, 0.03, 0.26, 0.03, 0.48);
    addCone(parts, 0, 0.16, 0, 0.24, 0.86, 4);
    return finish(parts);
  }
  addBox(parts, -0.032, 0, -0.032, 0.032, 0.3, 0.032, 0.48);
  if (variant === 0) addCone(parts, 0, 0.18, 0, 0.24, 0.95, 7);
  else if (variant === 1) addBlob(parts, 0, 0.52, 0, 0.26, 7);
  else {
    addCone(parts, 0, 0.16, 0, 0.26, 0.6, 6);
    addCone(parts, 0, 0.42, 0, 0.19, 0.88, 6, 0.92);
  }
  return finish(parts);
}

/** A street lamp: post, arm and head. Lines a road the way nothing else does. */
function lamp() {
  const parts = makeParts();
  addBox(parts, -0.014, 0, -0.014, 0.014, 0.34, 0.014, 0.5);      // post
  addBox(parts, -0.014, 0.34, -0.014, 0.075, 0.356, 0.014, 0.5);  // arm
  addBox(parts, 0.05, 0.316, -0.026, 0.098, 0.34, 0.026, 1.45);   // head, hanging
  addBox(parts, -0.026, 0, -0.026, 0.026, 0.016, 0.026, 0.42);    // base
  return finish(parts);
}

/** A parked car: body, cabin and a colour flash on the roof, which is exactly
 * what the transport-world reference does to make traffic readable. */
function car(variant, detail = 2) {
  const parts = makeParts();
  addBox(parts, -0.11, 0.012, -0.055, 0.11, 0.062, 0.055, 0.9);
  addBox(parts, -0.045, 0.062, -0.048, 0.06, 0.098, 0.048, 0.78);
  if (detail > 1) addPanel(parts, 2, 0.048, -0.04, 0.068, 0.055, 0.092, 0.3);
  if (detail > 1) addPanel(parts, 0, 0.048, -0.04, 0.068, 0.055, 0.092, 0.3);
  if (variant === 1) addBox(parts, -0.03, 0.098, -0.04, 0.045, 0.112, 0.04, 1.4);
  // Wheels, dark and low.
  for (const x of [-0.072, 0.072]) {
    for (const z of [-0.058, 0.058]) {
      addBox(parts, x - 0.022, 0, z - 0.012, x + 0.022, 0.026, z + 0.012, 0.3);
    }
  }
  return finish(parts);
}

/** Grass tufts and flowers. The reference's fields are covered in them, and
 * they are most of why its ground does not look like a bedsheet. */
function tuft(variant, detail = 2) {
  const parts = makeParts();
  if (variant === 0) {
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2;
      const x = Math.cos(a) * 0.02;
      const z = Math.sin(a) * 0.02;
      pushTri(parts, [x - 0.012, 0, z], [x + 0.012, 0, z], [x, 0.055, z + 0.005], 0.86);
    }
  } else {
    addBox(parts, -0.005, 0, -0.005, 0.005, 0.03, 0.005, 0.6);
    addBox(parts, -0.016, 0.03, -0.016, 0.016, 0.042, 0.016, 1.45);
  }
  return finish(parts);
}

export const VARIANTS = 4;
export const TREE_VARIANTS = 3;
export const CAR_VARIANTS = 2;
export const TUFT_VARIANTS = 2;

export function buildingVariants(kind, detail = 2) {
  const make = kind === "residential" ? residential
    : kind === "commercial" ? commercial
      : kind === "industrial" ? industrial
        : civic;
  const list = [];
  for (let i = 0; i < VARIANTS; i += 1) list.push(make(i, detail));
  return list;
}

export function treeVariants(detail = 2) {
  const list = [];
  for (let i = 0; i < TREE_VARIANTS; i += 1) list.push(tree(i, detail));
  return list;
}

export function carVariants() {
  const list = [];
  for (let i = 0; i < CAR_VARIANTS; i += 1) list.push(car(i));
  return list;
}

export function tuftVariants() {
  const list = [];
  for (let i = 0; i < TUFT_VARIANTS; i += 1) list.push(tuft(i));
  return list;
}

export function lampGeometry() {
  return lamp();
}

export { variantFor };

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
  addRoofClutter, addShopfront, addFence, addDormers, addPorch,
} from "./detail-kit.js";
import { variantFor, VARIANTS } from "../world/params.js";
import { civicShape, civicHeight, shadeOf, CIVIC_DEFS } from "../world/civic-spec.js";
import { hasPorchAtL2 } from "../world/house-spec.js";
import { cityFigure } from "../world/figure.js";

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

/** A prism standing on the ground: a silo, a tank, a bin. Enough sides that it
 * reads as round at the zoom a player uses and not one more. */
function addCylinder(parts, cx, y0, cz, radius, height, sides, tint = 1) {
  const y1 = y0 + height;
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * Math.PI * 2;
    const b = ((i + 1) / sides) * Math.PI * 2;
    const x0 = cx + Math.cos(a) * radius;
    const z0 = cz + Math.sin(a) * radius;
    const x1 = cx + Math.cos(b) * radius;
    const z1 = cz + Math.sin(b) * radius;
    // The face shade follows the angle, which is what gives a flat-shaded
    // cylinder its roundness without a normal per vertex.
    const face = tint * (0.72 + 0.28 * (0.5 + 0.5 * Math.cos(a)));
    pushQuad(parts, [x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], face);
    pushTri(parts, [cx, y1, cz], [x0, y1, z0], [x1, y1, z1], tint * 1.1);
  }
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
/** The civic kit's scale: a mass unit across is `W`, and up is `2W` (S6 places
 * rotors, stacks' smoke and flags on the shapes with it). */
export const CIVIC_W = W;

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

  if (variant === 4) {
    // A semi-detached PAIR under one ridge, with the party wall showing as a
    // chimney in the middle. Two front doors is what makes it read as two
    // houses rather than one wide one.
    addBox(parts, -W, 0, -W * 0.9, W, eave * 0.94, W * 0.9);
    roofPart(parts, () => pitchedRoof(parts, -W - 0.06, eave * 0.94, -W * 0.9 - 0.06, W + 0.06, 1.02, W * 0.9 + 0.06, true, detail));
    if (detail > 1) {
      addWindowGrid(parts, 2, W * 0.9, W, { from: 0.34, to: eave * 0.86, columns: 4, rows: 1 });
      addWindowGrid(parts, 0, W * 0.9, W, { from: 0.1, to: eave * 0.86, columns: 4, rows: 2 });
      addPanel(parts, 2, W * 0.9, -W * 0.78, 0.005, -W * 0.5, 0.24, 0.4);
      addPanel(parts, 2, W * 0.9, W * 0.5, 0.005, W * 0.78, 0.24, 0.4);
    }
    addBox(parts, -0.05, eave * 0.94, -0.06, 0.05, 1.16, 0.06, 0.58);
    addBox(parts, -0.065, 1.16, -0.075, 0.065, 1.185, 0.075, 0.5);
  } else if (variant === 5) {
    // A tall narrow townhouse: three storeys on a deep, narrow plan with a
    // steep roof, which is the silhouette a terrace of them makes.
    addBox(parts, -W * 0.66, 0, -W, W * 0.66, eave * 1.35, W);
    roofPart(parts, () => pitchedRoof(parts, -W * 0.66 - 0.05, eave * 1.35, -W - 0.05, W * 0.66 + 0.05, 1.42, W + 0.05, false, detail));
    if (detail > 1) for (const side of [0, 1, 2, 3]) {
      addWindowGrid(parts, side, side % 2 === 0 ? W * 0.66 : W, side % 2 === 0 ? W : W * 0.66, {
        from: 0.12, to: eave * 1.28, columns: side % 2 === 0 ? 2 : 3, rows: 3,
      });
    }
    if (detail > 1) addDoor(parts, W, 0.085, 0.22);
    addBox(parts, W * 0.4, eave * 1.35, -W * 0.4, W * 0.52, 1.62, -W * 0.28, 0.58);
  } else if (variant === 3) {
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

  // A porch, on the variants that have not already got one (S9). Variant 2 is
  // the bungalow, which builds its own; 4 is a semi with two front doors and
  // nowhere to put one. At L3 three houses in four have a porch, and the L2
  // box has to agree with the facade it is replaced by (E5's rule).
  if (detail > 0 && hasPorchAtL2(variant)) {
    const front = variant === 5 ? W : variant === 3 ? W : W * (variant === 4 ? 0.9 : 1);
    addPorch(parts, front, W * 0.26, eave * (variant === 5 ? 0.42 : 0.55));
  }

  // Chimney, offset per variant so a row of houses is not a row of clones.
  // Variants 4 and 5 carry their own and would otherwise get two.
  if (variant < 4) {
    const cx = variant === 1 ? -W * 0.55 : W * 0.5;
    addBox(parts, cx - 0.055, eave * 0.88, -W * 0.35, cx + 0.055, 1.13, -W * 0.35 + 0.11, 0.58);
    addBox(parts, cx - 0.07, 1.13, -W * 0.35 - 0.012, cx + 0.07, 1.155, -W * 0.35 + 0.122, 0.5);
  }
  // A garden boundary: suburbs read as suburbs because of them. A fence on
  // most, a HEDGE on some — one boundary treatment down a whole street is the
  // thing that makes a row read as a housing estate rather than a street
  // (slice V6).
  // Variants 2 and 4 get a HEDGE instead, from the garden pool in
  // `instances.js` — a hedge has to be green, and a shade baked into the
  // building's geometry can only ever be a shade of the building's own colour.
  if (variant !== 3 && variant !== 2 && variant !== 4) addFence(parts, W + 0.035, 0.05, 0.78);
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

  if (variant === 0) addShopfront(parts, W, 0.21, W * 0.9);
  if (variant === 2) {
    // A double-height glazed ground floor under a continuous awning: the same
    // box as variant 0 until V6, which is three storeys of clone down a street.
    addShopfront(parts, W, 0.3, W * 0.92);
    addBox(parts, -W, 0.3, W - 0.01, W, 0.34, W + 0.13, 1.18);
    if (detail > 1) addPanel(parts, 2, W, -W * 0.9, 0.03, W * 0.9, 0.28, 0.26);
  }
  if (variant === 1) {
    addBox(parts, -W * 0.72, top + 0.07, -W * 0.72, W * 0.72, top + 0.36, W * 0.72, 0.94);
    roofPart(parts, () => addBox(parts, -W * 0.75, top + 0.36, -W * 0.75, W * 0.75, top + 0.42, W * 0.75));
    if (detail > 1) addWindowGrid(parts, 2, W * 0.72, W * 0.72, { from: top + 0.12, to: top + 0.32, columns: 3, rows: 1 });
  }
  if (variant === 4) {
    // A corner block: the top two storeys step back, which is the silhouette a
    // 1930s high street corner makes and the one thing that breaks a row of
    // identical boxes at city zoom.
    addBox(parts, -W * 0.78, top + 0.07, -W * 0.78, W * 0.78, top + 0.3, W * 0.78, 0.96);
    roofPart(parts, () => addBox(parts, -W * 0.81, top + 0.3, -W * 0.81, W * 0.81, top + 0.36, W * 0.81));
    if (detail > 1) for (const side of [0, 2]) {
      addWindowGrid(parts, side, W * 0.78, W * 0.78, { from: top + 0.12, to: top + 0.26, columns: 3, rows: 1, windowShade: 0.3 });
    }
    if (detail > 1) addShopfront(parts, W, 0.21, W * 0.9);
  }
  if (variant === 5) {
    // An arcade: a colonnade at street level under a deep fascia band, so the
    // ground floor is a row of openings rather than a wall.
    if (detail > 1) for (let i = -2; i <= 2; i += 1) {
      const px = i * W * 0.42;
      addBox(parts, px - 0.028, 0, W - 0.01, px + 0.028, 0.26, W + 0.09, 0.62);
    }
    addBox(parts, -W, 0.26, W - 0.01, W, 0.32, W + 0.1, 0.9);
    addBox(parts, -W - 0.02, 0.32, -W - 0.02, W + 0.02, 0.4, W + 0.02, 1.24);
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

  if (variant === 2) {
    // A gantry rail down the length of the shed — the same sawtooth as variant
    // 0 until V6, which is half the industry in the city built twice.
    addBox(parts, -W - 0.06, top + 0.16, -W * 0.12, W + 0.06, top + 0.2, W * 0.12, 0.62);
    for (const px of [-W * 0.7, 0, W * 0.7]) {
      addBox(parts, px - 0.02, top, -W * 0.06, px + 0.02, top + 0.16, W * 0.06, 0.55);
    }
  }

  const stacks = variant === 1 ? 2 : 1;
  for (let i = 0; i < stacks; i += 1) {
    const sx = stacks === 1 ? W * 0.5 : -W * 0.45 + i * W * 0.9;
    addBox(parts, sx - 0.05, top, -W * 0.5, sx + 0.05, 1.25 + i * 0.08, -W * 0.5 + 0.1, 0.5);
    addBox(parts, sx - 0.062, 1.25 + i * 0.08, -W * 0.5 - 0.012, sx + 0.062, 1.28 + i * 0.08, -W * 0.5 + 0.112, 0.42);
  }
  if (variant === 4) {
    // Silos: two cylinders beside the shed, which is the one industrial
    // silhouette nobody mistakes for an office block.
    for (const sx of [-W * 0.55, -W * 0.1]) {
      addCylinder(parts, sx, top, W * 0.45, 0.17, 0.62, 10, 0.86);
      addCone(parts, sx, top + 0.62, W * 0.45, 0.19, 0.12, 10);
    }
  }
  if (variant === 5) {
    // A monitor roof: a raised glazed lantern down the ridge, which is how a
    // long shed is daylit and the reason it has a stepped profile.
    roofPart(parts, () => {
      addBox(parts, -W * 0.4, top + 0.06, -W, W * 0.4, top + 0.2, W, 0.92);
      addBox(parts, -W * 0.44, top + 0.2, -W - 0.02, W * 0.44, top + 0.25, W + 0.02);
    });
    if (detail > 1) addPanel(parts, 2, W * 0.4, -W * 0.34, top + 0.09, W * 0.34, top + 0.18, 0.3);
    if (detail > 1) addPanel(parts, 0, W * 0.4, -W * 0.34, top + 0.09, W * 0.34, top + 0.18, 0.3);
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

/** A civic building, per DEFINITION (slice S1).
 *
 * Twelve definitions had six generic silhouettes picked by a hash of the id, so
 * a coal plant and a park were the same box with different windows in it. The
 * masses come from `client/world/civic-spec.js`, which node can read and which
 * the L3 baker reads too — the L2/L3 agreement (E5) by construction rather than
 * by two people drawing the same building twice.
 *
 * `variant` IS the definition's index here; `buildingParams` puts it there.
 */
function civic(variant, detail) {
  const parts = makeParts();
  const shape = civicShape(variant);
  const top = civicHeight(variant);
  // The coarsest tier is still a block — but a block as tall as the SHAPE, so a
  // power station's stacks and a turbine's mast survive the silhouette pass
  // that flattens everything else (ruling 019's ladder).
  if (detail === 0) return blockForm(parts, Math.min(1.6, 0.5 + top * 0.4), false);

  for (let i = 0; i < shape.masses.length; i += 1) {
    const m = shape.masses[i];
    // The rotor is its own pool, turning (S6).
    if (m.rotor) continue;
    // The tallest mass wears the roof colour: on a hall it is the roof, on a
    // water tower it is the tank, and on a park it is the path. One rule, and
    // it is the one that makes a definition readable from the air.
    const roofish = m.y1 >= top - 1e-6 && shape.masses.length > 1;
    // The MATERIAL as a shade (S1b). An instanced pool has one colour, so at
    // city zoom "brick" and "steel" are a multiplier on the building's own
    // tone — and without it the box is one flat grey, which is exactly what
    // the shape table stopping carrying numeric shades produced.
    const build = () => addBox(parts, m.x0 * W, m.y0 * W * 2, m.z0 * W,
      m.x1 * W, m.y1 * W * 2, m.z1 * W, shadeOf(m.mat) * (m.shade ?? 1));
    if (roofish) roofPart(parts, build);
    else build();
  }
  // Windows and a door on the biggest mass, which is the one a person goes into.
  if (detail > 1) {
    const hall = shape.masses.reduce((best, m) =>
      (m.x1 - m.x0) * (m.z1 - m.z0) * (m.y1 - m.y0) > (best.x1 - best.x0) * (best.z1 - best.z0) * (best.y1 - best.y0)
        ? m : best, shape.masses[0]);
    const hx = Math.min(W, Math.max(hall.x0, hall.x1) * W);
    const hz = Math.min(W, Math.max(hall.z0, hall.z1) * W);
    if (hall.y1 - hall.y0 > 0.3) {
      addWindowGrid(parts, 2, hx, hz, {
        from: hall.y0 * W * 2 + 0.08, to: hall.y1 * W * 2 - 0.06,
        columns: 3, rows: hall.y1 - hall.y0 > 0.8 ? 2 : 1, windowShade: 0.32,
      });
      addDoor(parts, hz, 0.1, 0.22);
    }
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

/** A person: legs, a torso and a head, in tile units (slice E7, spec §9.3).
 *
 * Three boxes, and the spec's "two-part body with a walk-cycle bob" is exactly
 * what that is — the bob is in `life/pedestrians.js`, because it is motion and
 * not geometry. At 1.7 m tall on a 20 m tile a person is 0.085 units high and
 * eleven pixels on screen at the zoom street mode uses, so anything more
 * detailed than this is triangles nobody can see (ruling 019).
 *
 * The two variants are a different SHAPE and not a different colour: V6's
 * lesson is that two variants which hash the same are a city of clones and a
 * green suite.
 */
function person(variant, detail = 2) {
  const parts = makeParts();
  const tall = variant === 1;
  const hip = tall ? 0.048 : 0.043;
  const neck = tall ? 0.076 : 0.072;
  const top = tall ? 0.088 : 0.083;
  const halfW = tall ? 0.010 : 0.012;
  // Legs: one box, because two at this size is two pixels of gap.
  addBox(parts, -halfW * 0.7, 0, -0.006, halfW * 0.7, hip, 0.006, 0.55);
  // Torso, which is the part that takes the instance colour.
  addBox(parts, -halfW, hip, -0.007, halfW, neck, 0.007, 1);
  addBox(parts, -halfW * 0.55, neck, -0.006, halfW * 0.55, top, 0.006, 0.8);
  // A bag on one shoulder, on one variant only — the silhouette difference.
  if (detail > 1 && tall) addBox(parts, halfW, hip + 0.008, -0.004, halfW + 0.007, neck - 0.004, 0.004, 0.45);
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

// VARIANTS comes from the MODEL (`world/params.js`), which is what picks a
// variant per building. It was declared here as well, and the two numbers had
// to agree or `pools[kind + variant]` came back undefined and every building of
// the missing variant silently stopped being drawn (slice V6).
export { VARIANTS };
export const TREE_VARIANTS = 3;
export const CAR_VARIANTS = 2;
export const PED_VARIANTS = 2;
export const TUFT_VARIANTS = 2;

export function buildingVariants(kind, detail = 2) {
  const make = kind === "residential" ? residential
    : kind === "commercial" ? commercial
      : kind === "industrial" ? industrial
        : civic;
  // Civic has one pool per DEFINITION (S1), not per hashed variant — twelve
  // rather than six, and the index means the same thing here as it does in
  // `buildingParams`, which is the pairing V6 was written about.
  const count = kind === "civic" ? CIVIC_DEFS.length : VARIANTS;
  const list = [];
  for (let i = 0; i < count; i += 1) list.push(make(i, detail));
  return list;
}

export function treeVariants(detail = 2) {
  const list = [];
  for (let i = 0; i < TREE_VARIANTS; i += 1) list.push(tree(i, detail));
  return list;
}

/** The lamps a car shows about what it is DOING (slice B4).
 *
 * Two quads at the back for the brakes and one at each front corner for the
 * indicators, as their own tiny geometries — an instanced pool the traffic
 * pushes into only for the cars that are actually braking or turning, so the
 * cost is the cars showing them rather than every car in the city.
 *
 * Separate from the car body because a per-instance colour cannot say "this
 * one's brakes are on": the body pool carries the paint, and these carry the
 * signal.
 */
export function carLampGeometry(kind) {
  const parts = makeParts();
  if (kind === "brake") {
    for (const z of [-0.036, 0.036]) {
      addBox(parts, -0.118, 0.03, z - 0.012, -0.104, 0.05, z + 0.012, 1);
    }
  } else {
    // One corner, mirrored by the rotation the pusher applies: an indicator is
    // on the side the car is turning towards.
    addBox(parts, 0.102, 0.03, 0.03, 0.116, 0.048, 0.054, 1);
  }
  return finish(parts);
}

export function carVariants() {
  const list = [];
  for (let i = 0; i < CAR_VARIANTS; i += 1) list.push(car(i));
  return list;
}

/** The person seen from the air (B7): `client/world/figure.js`'s twelve faces,
 * handed over in the order they were wound — `pushTri` takes its normal from
 * that order, and the figure module is where the winding is tested. */
export function cityPersonGeometry() {
  const parts = makeParts();
  for (const { tri: [a, b, c], shade } of cityFigure()) pushTri(parts, a, b, c, shade);
  return finish(parts);
}

/** Stones for rock and dirt ground (S2): five faces round a raised point,
 * three sizes, wound so every face points out of the stone. */
export const BOULDER_VARIANTS = 3;

function boulder(size) {
  const parts = makeParts();
  const r = [0.035, 0.06, 0.09][size];
  const h = r * 0.75;
  const ring = [];
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + size;
    const k = 0.78 + 0.22 * (((i * 7 + size * 3) % 5) / 4);
    ring.push([Math.cos(a) * r * k, 0, Math.sin(a) * r * k]);
  }
  const top = [r * 0.15, h, -r * 0.1];
  for (let i = 0; i < 5; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % 5];
    const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
    const vx = top[0] - a[0]; const vy = top[1] - a[1]; const vz = top[2] - a[2];
    const nx = uy * vz - uz * vy;
    const nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[2] + b[2]) / 2;
    const shade = 0.85 + 0.05 * i;
    if (nx * mx + nz * mz >= 0) pushTri(parts, a, b, top, shade);
    else pushTri(parts, a, top, b, shade);
  }
  return finish(parts);
}

export function boulderVariants() {
  const list = [];
  for (let v = 0; v < BOULDER_VARIANTS; v += 1) list.push(boulder(v));
  return list;
}

/** A sign post on an empty plot (S2, Q73): a pole and a board. */
export function signGeometry() {
  const parts = makeParts();
  addBox(parts, -0.004, 0, -0.004, 0.004, 0.06, 0.004, 0.6);
  addBox(parts, -0.022, 0.042, -0.003, 0.022, 0.068, 0.003, 1.3);
  return finish(parts);
}

/** Turns the vertices added since `from` about the local z axis. */
function rotateAddedZ(parts, from, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let i = from; i < parts.position.length; i += 3) {
    const x = parts.position[i];
    const y = parts.position[i + 1];
    parts.position[i] = c * x - s * y;
    parts.position[i + 1] = s * x + c * y;
    const nx = parts.normal[i];
    const ny = parts.normal[i + 1];
    parts.normal[i] = c * nx - s * ny;
    parts.normal[i + 1] = s * nx + c * ny;
  }
}

/** A turbine's rotor (S6): a hub and three blades at 120°, in the civic kit's
 * units about the hub, so the pool turns it about z. */
export function rotorGeometry() {
  const parts = makeParts();
  addBox(parts, -0.06 * W, -0.06 * W, -0.06 * W, 0.06 * W, 0.06 * W, 0.06 * W, 0.8);
  for (let k = 0; k < 3; k += 1) {
    const from = parts.position.length;
    addBox(parts, -0.035 * W, 0.05 * W, -0.03 * W, 0.035 * W, 0.85 * W, 0.03 * W, 1);
    rotateAddedZ(parts, from, (k * 2 * Math.PI) / 3);
  }
  return finish(parts);
}

/** A flag (S6): a pole and a cloth of four segments along x, both faces, so
 * the shader can ripple it. Tile units: a 6 m pole with a 2.8 m cloth. The
 * first was 2 m with a 1.1 m cloth, true to a hand flag and two pixels at a
 * city zoom — a rooftop flagpole is five to eight metres. */
export const FLAG_LEN = 0.14;
export function flagGeometry() {
  const parts = makeParts();
  addBox(parts, -0.005, 0, -0.005, 0.005, 0.3, 0.005, 0.7);
  const y0 = 0.22;
  const y1 = 0.29;
  for (let i = 0; i < 4; i += 1) {
    const x0 = 0.005 + (FLAG_LEN - 0.005) * (i / 4);
    const x1 = 0.005 + (FLAG_LEN - 0.005) * ((i + 1) / 4);
    pushQuad(parts, [x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], 1);
    pushQuad(parts, [x0, y0, 0], [x0, y1, 0], [x1, y1, 0], [x1, y0, 0], 0.85);
  }
  return finish(parts);
}

/** A tower crane (S6): a mast, a jib with its counterweight and a hook line.
 * Everything above `CRANE_SLEW` turns with the jib. Tile units. */
export const CRANE_MAST = 0.55;
export const CRANE_SLEW = CRANE_MAST - 0.16;
export function craneGeometry() {
  const parts = makeParts();
  addBox(parts, -0.01, 0, -0.01, 0.01, CRANE_MAST, 0.01, 0.9);
  addBox(parts, -0.12, CRANE_MAST, -0.008, 0.38, CRANE_MAST + 0.018, 0.008, 1);
  addBox(parts, -0.12, CRANE_MAST + 0.018, -0.015, -0.07, CRANE_MAST + 0.045, 0.015, 0.5);
  addBox(parts, 0.3, CRANE_MAST - 0.14, -0.002, 0.304, CRANE_MAST, 0.002, 0.6);
  return finish(parts);
}

/** A puff of smoke (S6): two crossed quads, both faces, so it reads from any
 * side. The shader lifts, drifts, grows and fades it. Tile units. */
export const SMOKE_HALF = 0.08;
export function smokeGeometry() {
  const parts = makeParts();
  const s = SMOKE_HALF;
  pushQuad(parts, [-s, -s, 0], [s, -s, 0], [s, s, 0], [-s, s, 0], 1);
  pushQuad(parts, [-s, -s, 0], [-s, s, 0], [s, s, 0], [s, -s, 0], 1);
  pushQuad(parts, [0, -s, -s], [0, s, -s], [0, s, s], [0, -s, s], 1);
  pushQuad(parts, [0, -s, -s], [0, -s, s], [0, s, s], [0, s, -s], 1);
  return finish(parts);
}

export function pedVariants() {
  const list = [];
  for (let i = 0; i < PED_VARIANTS; i += 1) list.push(person(i));
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

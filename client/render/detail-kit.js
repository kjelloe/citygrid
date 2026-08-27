// Surface detail: windows, doors, balconies, roof clutter, fences, signage.
//
// The reference images earn their charm from what is ON a building, not from
// its outline: rows of lit windows, a door with a step, a balcony rail, an air
// conditioner on the roof, a shop sign over the pavement.
//
// Almost all of it is FLAT QUADS held a millimetre proud of the wall rather
// than boxes. A window box costs twelve triangles; a window quad costs two,
// and at this camera distance they are indistinguishable. That is what makes a
// city of detailed buildings affordable.

// Face shades, matched to building-kit so detail sits in the same light.
const TOP = 1.0;
const SOUTH = 0.88;
const NORTH = 0.7;
const EAST = 0.8;
const WEST = 0.62;

const EPS = 0.006;

export function pushTri(parts, a, b, c, shade) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  for (const v of [a, b, c]) {
    parts.position.push(v[0], v[1], v[2]);
    parts.normal.push(nx / len, ny / len, nz / len);
    parts.colour.push(shade, shade, shade);
  }
}

export function pushQuad(parts, a, b, c, d, shade) {
  pushTri(parts, a, b, c, shade);
  pushTri(parts, a, c, d, shade);
}

export function addBox(parts, x0, y0, z0, x1, y1, z1, tint = 1) {
  const p = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ];
  pushQuad(parts, p[4], p[7], p[6], p[5], TOP * tint);
  pushQuad(parts, p[0], p[1], p[2], p[3], NORTH * 0.5 * tint);
  pushQuad(parts, p[0], p[4], p[5], p[1], NORTH * tint);
  pushQuad(parts, p[3], p[2], p[6], p[7], SOUTH * tint);
  pushQuad(parts, p[1], p[5], p[6], p[2], EAST * tint);
  pushQuad(parts, p[0], p[3], p[7], p[4], WEST * tint);
}

/** A flat panel on one of the four walls, in wall-local coordinates.
 *
 * `side` is 0:-z 1:+x 2:+z 3:-x. `u` runs along the wall, `v` up it, both in
 * the range the caller gives. This is the workhorse — windows, doors, signs
 * and vents are all panels. */
export function addPanel(parts, side, extent, u0, v0, u1, v1, shade) {
  const e = extent;
  let a; let b; let c; let d;
  if (side === 0) {
    a = [u0, v0, -e - EPS]; b = [u1, v0, -e - EPS]; c = [u1, v1, -e - EPS]; d = [u0, v1, -e - EPS];
    pushQuad(parts, a, d, c, b, shade * NORTH);
  } else if (side === 2) {
    a = [u0, v0, e + EPS]; b = [u1, v0, e + EPS]; c = [u1, v1, e + EPS]; d = [u0, v1, e + EPS];
    pushQuad(parts, a, b, c, d, shade * SOUTH);
  } else if (side === 1) {
    a = [e + EPS, v0, u0]; b = [e + EPS, v0, u1]; c = [e + EPS, v1, u1]; d = [e + EPS, v1, u0];
    pushQuad(parts, a, d, c, b, shade * EAST);
  } else {
    a = [-e - EPS, v0, u0]; b = [-e - EPS, v0, u1]; c = [-e - EPS, v1, u1]; d = [-e - EPS, v1, u0];
    pushQuad(parts, a, b, c, d, shade * WEST);
  }
}

/** A grid of windows on one wall, with a frame implied by leaving a gap.
 *
 * Windows are the single strongest detail cue there is: a blank wall is a
 * shape, a wall with six windows is a building someone lives in. */
export function addWindowGrid(parts, side, extent, span, {
  from, to, columns, rows, windowShade = 0.46, sillShade = 1.3, sills = true,
}) {
  // Windows sit inside a frame rather than filling their cell. Full-cell
  // windows read as a dark grid — the wall disappears and the building becomes
  // a bookcase. The frame is what makes them windows.
  const cellU = (span * 2) / (columns * 2 + 1);
  const height = (to - from) / (rows * 2 + 1);
  const insetU = cellU * 0.16;
  const insetV = height * 0.14;
  for (let r = 0; r < rows; r += 1) {
    const v0 = from + height * (r * 2 + 1);
    const v1 = v0 + height;
    for (let c = 0; c < columns; c += 1) {
      const u0 = -span + cellU * (c * 2 + 1);
      const u1 = u0 + cellU;
      // Frame behind, glass in front of it: two quads, one legible window.
      addPanel(parts, side, extent, u0, v0, u1, v1, sillShade * 0.86);
      addPanel(parts, side, extent + 0.004, u0 + insetU, v0 + insetV, u1 - insetU, v1 - insetV, windowShade);
      // A sill: one bright line under each window. Cheap, and it is what stops
      // the windows reading as holes.
      if (sills) addPanel(parts, side, extent + 0.002, u0 - cellU * 0.06, v0 - height * 0.14, u1 + cellU * 0.06, v0 - height * 0.02, sillShade);
    }
  }
}

/** A door with a step, always on the +z wall so buildings have a front. */
export function addDoor(parts, extent, width = 0.1, height = 0.22, shade = 0.42) {
  addPanel(parts, 2, extent, -width, 0.005, width, height, shade);
  addPanel(parts, 2, extent, -width * 1.25, height, width * 1.25, height + 0.022, 1.25);
  addBox(parts, -width * 1.1, 0, extent, width * 1.1, 0.022, extent + 0.05, 0.8);
}

/** A balcony: a slab and a rail. Reads immediately as somewhere people are. */
export function addBalcony(parts, extent, y, halfWidth, shade = 0.9) {
  addBox(parts, -halfWidth, y, extent, halfWidth, y + 0.016, extent + 0.075, shade);
  addBox(parts, -halfWidth, y + 0.016, extent + 0.062, halfWidth, y + 0.075, extent + 0.075, shade * 0.7);
  addBox(parts, -halfWidth, y + 0.016, extent, -halfWidth + 0.014, y + 0.075, extent + 0.075, shade * 0.7);
  addBox(parts, halfWidth - 0.014, y + 0.016, extent, halfWidth, y + 0.075, extent + 0.075, shade * 0.7);
}

/** Air conditioners, water tanks, vents and skylights. What a flat roof is
 * actually covered in, and the difference between a roof and a lid. */
export function addRoofClutter(parts, extent, y, seed) {
  const pick = (n) => Math.floor(pseudo(seed + n) * 4);
  const at = (n) => (pseudo(seed + n) - 0.5) * extent * 1.2;

  // Air conditioning unit.
  addBox(parts, at(1) - 0.05, y, at(2) - 0.05, at(1) + 0.05, y + 0.045, at(2) + 0.05, 0.62);
  addBox(parts, at(1) - 0.036, y + 0.045, at(2) - 0.036, at(1) + 0.036, y + 0.056, at(2) + 0.036, 0.5);

  if (pick(3) > 1) {
    // Water tank on short legs.
    const tx = at(4);
    const tz = at(5);
    addBox(parts, tx - 0.045, y, tz - 0.045, tx - 0.03, y + 0.05, tz - 0.03, 0.45);
    addBox(parts, tx + 0.03, y, tz + 0.03, tx + 0.045, y + 0.05, tz + 0.045, 0.45);
    addBox(parts, tx - 0.055, y + 0.05, tz - 0.055, tx + 0.055, y + 0.12, tz + 0.055, 0.72);
  }
  if (pick(6) > 2) {
    // Roof hatch.
    const hx = at(7);
    const hz = at(8);
    addBox(parts, hx - 0.04, y, hz - 0.04, hx + 0.04, y + 0.022, hz + 0.04, 0.8);
  }
  // A vent pipe or two.
  const vents = 1 + pick(9) % 2;
  for (let i = 0; i < vents; i += 1) {
    const vx = at(10 + i);
    const vz = at(20 + i);
    addBox(parts, vx - 0.014, y, vz - 0.014, vx + 0.014, y + 0.075, vz + 0.014, 0.5);
  }
}

/** A shop sign over the pavement, and an awning under it. */
export function addShopfront(parts, extent, y, halfWidth, shade = 1.35) {
  addBox(parts, -halfWidth, y, extent, halfWidth, y + 0.05, extent + 0.1, 0.72);
  addPanel(parts, 2, extent, -halfWidth, y + 0.055, halfWidth, y + 0.115, shade);
}

/** A low fence or hedge around a plot. Suburbs read as suburbs because of
 * boundaries, not because of the houses. */
export function addFence(parts, extent, height = 0.055, shade = 0.75) {
  const e = extent;
  addBox(parts, -e, 0, -e, e, height, -e + 0.022, shade);
  addBox(parts, -e, 0, e - 0.022, -0.11, height, e, shade);
  addBox(parts, 0.11, 0, e - 0.022, e, height, e, shade);
  addBox(parts, -e, 0, -e, -e + 0.022, height, e, shade);
  addBox(parts, e - 0.022, 0, -e, e, height, e, shade);
}

/** Dormer windows in a pitched roof. */
export function addDormers(parts, extent, eave, ridge, count, seed) {
  const width = 0.07;
  for (let i = 0; i < count; i += 1) {
    const t = (i + 1) / (count + 1);
    const x = -extent + extent * 2 * t;
    const y = eave + (ridge - eave) * 0.3;
    addBox(parts, x - width, y, extent * 0.18, x + width, y + 0.09, extent * 0.52, 0.94);
    addPanel(parts, 2, extent * 0.52, x - width * 0.6, y + 0.02, x + width * 0.6, y + 0.075, 0.34);
    void seed;
  }
}

/** Deterministic 0..1 from an integer, so every detail placement is stable. */
export function pseudo(n) {
  let h = ((n + 1) * 2654435761) >>> 0;
  h ^= h >>> 15;
  h = (h * 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 8) / 0xffffff;
}

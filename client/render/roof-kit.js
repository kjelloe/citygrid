// Roofs at L3 (slice E5; spec §6.3).
//
// Five European forms as pure arithmetic over arrays, returning the same
// `{ position, normal, uv, triangles }` shape `ribbon.js` does — so node can
// check the two things that matter and a screenshot cannot: that the roof is
// CLOSED, and that it overhangs the wall it sits on. The stepped roof the
// reference is recognised by stays at L2 (art-direction §3.3); at L3 a roof is
// a real pitched form whose eave casts a shadow line on the wall, which is the
// most legible cue at eye height and costs nothing.
//
// No three, no DOM. `streets-l3.js` turns these buffers into geometry.

import { sink } from "./solid.js";

export const ROOF_KINDS = Object.freeze(["gable", "hip", "mansard", "flat", "sawtooth"]);

/** Gable and mansard both ridge along the LONGER axis: a terrace runs with the
 * street, and a house whose ridge crosses its own frontage reads as rotated. */
function longAxis(x0, z0, x1, z1) {
  return (x1 - x0) >= (z1 - z0) ? "x" : "z";
}

function gable(s, b) {
  const { x0, z0, x1, z1, y, pitch } = b;
  const along = longAxis(x0, z0, x1, z1);
  const halfSpan = along === "x" ? (z1 - z0) / 2 : (x1 - x0) / 2;
  const ridgeY = y + halfSpan * pitch;
  if (along === "x") {
    const mz = (z0 + z1) / 2;
    const a = [x0, y, z0]; const c = [x1, y, z0];
    const d = [x1, y, z1]; const e = [x0, y, z1];
    const r0 = [x0, ridgeY, mz]; const r1 = [x1, ridgeY, mz];
    s.quad(a, c, r1, r0);          // north slope
    s.quad(d, e, r0, r1);          // south slope
    s.tri(a, r0, e);               // west gable end
    s.tri(c, d, r1);               // east gable end
    s.quad(e, d, c, a);            // soffit
  } else {
    const mx = (x0 + x1) / 2;
    const a = [x0, y, z0]; const c = [x1, y, z0];
    const d = [x1, y, z1]; const e = [x0, y, z1];
    const r0 = [mx, ridgeY, z0]; const r1 = [mx, ridgeY, z1];
    s.quad(c, d, r1, r0);          // east slope
    s.quad(e, a, r0, r1);          // west slope
    s.tri(a, c, r0);               // north gable end
    s.tri(d, e, r1);               // south gable end
    s.quad(e, d, c, a);            // soffit
  }
}

function hip(s, b) {
  const { x0, z0, x1, z1, y, pitch } = b;
  const along = longAxis(x0, z0, x1, z1);
  const halfSpan = along === "x" ? (z1 - z0) / 2 : (x1 - x0) / 2;
  const ridgeY = y + halfSpan * pitch;
  // The ridge is inset from both short ends by the half-span, which is what
  // makes the ends slopes rather than walls.
  const inset = Math.min(halfSpan, (along === "x" ? x1 - x0 : z1 - z0) / 2 - 0.01);
  const a = [x0, y, z0]; const c = [x1, y, z0];
  const d = [x1, y, z1]; const e = [x0, y, z1];
  const mz = (z0 + z1) / 2;
  const mx = (x0 + x1) / 2;
  const r0 = along === "x" ? [x0 + inset, ridgeY, mz] : [mx, ridgeY, z0 + inset];
  const r1 = along === "x" ? [x1 - inset, ridgeY, mz] : [mx, ridgeY, z1 - inset];
  if (along === "x") {
    s.quad(a, c, r1, r0);
    s.quad(d, e, r0, r1);
    s.tri(a, r0, e);
    s.tri(c, d, r1);
  } else {
    s.quad(c, d, r1, r0);
    s.quad(e, a, r0, r1);
    s.tri(a, c, r0);
    s.tri(d, e, r1);
  }
  s.quad(e, d, c, a);
}

/** Two pitches: a steep skirt to a break, then a shallow top. */
function mansard(s, b) {
  const { x0, z0, x1, z1, y, pitch } = b;
  const along = longAxis(x0, z0, x1, z1);
  const halfSpan = along === "x" ? (z1 - z0) / 2 : (x1 - x0) / 2;
  const breakIn = halfSpan * 0.45;
  const breakY = y + breakIn * pitch * 1.8;
  const ridgeY = breakY + (halfSpan - breakIn) * pitch * 0.35;
  const a = [x0, y, z0]; const c = [x1, y, z0];
  const d = [x1, y, z1]; const e = [x0, y, z1];
  if (along === "x") {
    const bn0 = [x0 + breakIn, breakY, z0 + breakIn];
    const bn1 = [x1 - breakIn, breakY, z0 + breakIn];
    const bs1 = [x1 - breakIn, breakY, z1 - breakIn];
    const bs0 = [x0 + breakIn, breakY, z1 - breakIn];
    const mz = (z0 + z1) / 2;
    const r0 = [x0 + breakIn, ridgeY, mz];
    const r1 = [x1 - breakIn, ridgeY, mz];
    s.quad(a, c, bn1, bn0);        // steep north
    s.quad(d, e, bs0, bs1);        // steep south
    s.quad(c, d, bs1, bn1);        // steep east
    s.quad(e, a, bn0, bs0);        // steep west
    s.quad(bn0, bn1, r1, r0);      // shallow north
    s.quad(bs1, bs0, r0, r1);      // shallow south
    s.tri(bn0, r0, bs0);           // shallow west
    s.tri(bn1, bs1, r1);           // shallow east
  } else {
    const bn0 = [x0 + breakIn, breakY, z0 + breakIn];
    const bn1 = [x1 - breakIn, breakY, z0 + breakIn];
    const bs1 = [x1 - breakIn, breakY, z1 - breakIn];
    const bs0 = [x0 + breakIn, breakY, z1 - breakIn];
    const mx = (x0 + x1) / 2;
    const r0 = [mx, ridgeY, z0 + breakIn];
    const r1 = [mx, ridgeY, z1 - breakIn];
    s.quad(a, c, bn1, bn0);
    s.quad(d, e, bs0, bs1);
    s.quad(c, d, bs1, bn1);
    s.quad(e, a, bn0, bs0);
    s.quad(bn1, bs1, r1, r0);
    s.quad(bs0, bn0, r0, r1);
    s.tri(bn0, bn1, r0);
    s.tri(bs1, bs0, r1);
  }
  s.quad(e, d, c, a);
}

/**
 * A deck inside a parapet, as ONE shell: outside walls, a rim across the top,
 * inside walls, the deck itself, and a soffit.
 *
 * Five separate boxes would have been easier and were what this was first. It
 * is watertight but not manifold — the parapet boxes sit ON the deck's top
 * face, so those edges are used three times — and "every edge exactly twice"
 * is the only cheap test that catches a hole. A test weakened to accommodate
 * the geometry stops catching the thing it was for.
 */
function flat(s, b) {
  const { x0, z0, x1, z1, y, parapet } = b;
  const soffit = y - 0.12;
  if (parapet <= 0) {
    s.box(x0, soffit, z0, x1, y, z1);
    return;
  }
  const t = 0.22;
  const top = y + parapet;
  const ix0 = x0 + t; const ix1 = x1 - t;
  const iz0 = z0 + t; const iz1 = z1 - t;
  const O = (yy) => [[x0, yy, z0], [x1, yy, z0], [x1, yy, z1], [x0, yy, z1]];
  const I = (yy) => [[ix0, yy, iz0], [ix1, yy, iz0], [ix1, yy, iz1], [ix0, yy, iz1]];
  const ob = O(soffit); const ot = O(top); const it = I(top); const ideck = I(y);
  // Outside walls, bottom to top.
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    s.quad(ob[i], ob[j], ot[j], ot[i]);
  }
  // The rim across the top of the parapet.
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    s.quad(ot[i], ot[j], it[j], it[i]);
  }
  // Inside walls, down to the deck.
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    s.quad(it[i], it[j], ideck[j], ideck[i]);
  }
  s.quad(ideck[0], ideck[1], ideck[2], ideck[3]);   // the deck
  s.quad(ob[3], ob[2], ob[1], ob[0]);               // the soffit
}

/** Teeth across the long axis: a shed roof per tooth with a glazed riser. */
function sawtooth(s, b) {
  const { x0, z0, x1, z1, y, pitch } = b;
  const along = longAxis(x0, z0, x1, z1);
  const span = along === "x" ? x1 - x0 : z1 - z0;
  const across0 = along === "x" ? z0 : x0;
  const across1 = along === "x" ? z1 : x1;
  const teeth = Math.max(1, Math.round(span / 8));
  const w = span / teeth;
  const rise = w * pitch;
  const at = (u, yy, v) => (along === "x" ? [u, yy, v] : [v, yy, u]);
  for (let i = 0; i < teeth; i += 1) {
    const u0 = (along === "x" ? x0 : z0) + i * w;
    const u1 = u0 + w;
    // Slope down from the high edge at u0 to the eave at u1, then a vertical
    // riser back up to the next tooth.
    const hi = [at(u0, y + rise, across0), at(u0, y + rise, across1)];
    const lo = [at(u1, y, across0), at(u1, y, across1)];
    const base = [at(u0, y, across0), at(u0, y, across1)];
    s.quad(hi[0], lo[0], lo[1], hi[1]);            // the slope
    s.quad(base[0], base[1], hi[1], hi[0]);        // the riser (the glazing)
    s.tri(base[0], hi[0], lo[0]);                  // the two ends
    s.tri(base[1], lo[1], hi[1]);
    s.quad(base[1], base[0], lo[0], lo[1]);        // soffit under this tooth
  }
}

const BUILDERS = { gable, hip, mansard, flat, sawtooth };

/**
 * One roof over the box `(x0, z0)–(x1, z1)` whose walls stop at `y`.
 *
 * `eave` widens the footprint on every side before the form is built, which is
 * what makes the overhang an overhang rather than a chamfer on the wall.
 */
export function roof(box) {
  const eave = box.eave ?? 0;
  const build = BUILDERS[box.kind];
  if (!build) return { position: new Float32Array(0), normal: new Float32Array(0), uv: new Float32Array(0), triangles: 0 };
  const s = sink();
  build(s, {
    ...box,
    x0: box.x0 - eave, z0: box.z0 - eave, x1: box.x1 + eave, z1: box.z1 + eave,
    pitch: box.pitch ?? 0.6,
    parapet: box.parapet ?? 0,
  });
  return s.done();
}

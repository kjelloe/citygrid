// The roof kit (slice E5; spec §6.3).
//
// Five forms — gable, hip, mansard, flat with parapet, sawtooth — as pure
// arithmetic over arrays, for the reason the whole cityviewer lane keeps
// relearning: a hole in a roof is invisible from the street and obvious from
// the one angle nobody shot. The two things a roof has to get right are that
// it is CLOSED (every edge shared by exactly two triangles, so there is no
// gap to see the sky through) and that it OVERHANGS (the eave's shadow line is
// the most legible cue at eye height, and an eave narrower than the wall is
// not an eave).

import test from "node:test";
import assert from "node:assert/strict";
import { roof, ROOF_KINDS } from "../client/render/roof-kit.js";

const BOX = { x0: 0, z0: 0, x1: 12, z1: 8, y: 6 };

/** Every edge of every triangle, keyed by its two endpoints in a fixed order. */
function edgeCounts(part) {
  const p = part.position;
  const key = (i) => `${p[i * 3].toFixed(4)},${p[i * 3 + 1].toFixed(4)},${p[i * 3 + 2].toFixed(4)}`;
  const counts = new Map();
  for (let t = 0; t < part.triangles; t += 1) {
    const v = [t * 3, t * 3 + 1, t * 3 + 2].map(key);
    for (let e = 0; e < 3; e += 1) {
      const pair = [v[e], v[(e + 1) % 3]].sort().join("|");
      counts.set(pair, (counts.get(pair) ?? 0) + 1);
    }
  }
  return counts;
}

function bounds(part) {
  const p = part.position;
  const out = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (let i = 0; i < part.triangles * 3; i += 1) {
    out.x0 = Math.min(out.x0, p[i * 3]); out.x1 = Math.max(out.x1, p[i * 3]);
    out.y0 = Math.min(out.y0, p[i * 3 + 1]); out.y1 = Math.max(out.y1, p[i * 3 + 1]);
    out.z0 = Math.min(out.z0, p[i * 3 + 2]); out.z1 = Math.max(out.z1, p[i * 3 + 2]);
  }
  return out;
}

test("every kind builds something, and only the kinds it knows", () => {
  assert.deepEqual([...ROOF_KINDS].sort(), ["flat", "gable", "hip", "mansard", "sawtooth"]);
  for (const kind of ROOF_KINDS) {
    const part = roof({ ...BOX, kind, eave: 0.5, pitch: 0.6, parapet: 0.7 });
    assert.ok(part.triangles > 0, `${kind} built nothing`);
    assert.equal(part.position.length, part.triangles * 9);
    assert.equal(part.normal.length, part.triangles * 9);
  }
});

test("no roof has a hole in it: every edge is used an EVEN number of times", () => {
  // The invariant that catches a missing triangle. A hole always leaves an odd
  // count behind, whether the edge was used twice (a single shell) or four
  // times (where two closed shells meet).
  for (const kind of ROOF_KINDS) {
    const part = roof({ ...BOX, kind, eave: 0.5, pitch: 0.6, parapet: 0.7 });
    const odd = [...edgeCounts(part)].filter(([, n]) => n % 2 === 1);
    assert.deepEqual(odd.map(([e, n]) => `${kind}: ${e} used ${n}×`), [],
      `${kind} has ${odd.length} unshared edge(s) — you can see the sky through it`);
  }
});

test("the single-shell roofs are manifold: every edge used exactly twice", () => {
  // A sawtooth is deliberately N closed teeth, and where two of them meet the
  // shared line is used four times. Everything else is one surface, and for
  // those "exactly twice" is the stronger statement — it is what caught the
  // flat roof when it was five stacked boxes with the parapet standing on the
  // deck's own top face.
  for (const kind of ["gable", "hip", "mansard", "flat"]) {
    const part = roof({ ...BOX, kind, eave: 0.5, pitch: 0.6, parapet: 0.7 });
    const open = [...edgeCounts(part)].filter(([, n]) => n !== 2);
    assert.deepEqual(open.map(([e, n]) => `${kind}: ${e} used ${n}×`), []);
  }
});

test("a pitched roof overhangs its walls on every side", () => {
  for (const kind of ["gable", "hip", "mansard"]) {
    const eave = 0.5;
    const b = bounds(roof({ ...BOX, kind, eave, pitch: 0.6, parapet: 0 }));
    assert.ok(Math.abs(b.x0 - (BOX.x0 - eave)) < 1e-6, `${kind} west edge at ${b.x0}`);
    assert.ok(Math.abs(b.x1 - (BOX.x1 + eave)) < 1e-6, `${kind} east edge at ${b.x1}`);
    assert.ok(Math.abs(b.z0 - (BOX.z0 - eave)) < 1e-6, `${kind} north edge at ${b.z0}`);
    assert.ok(Math.abs(b.z1 - (BOX.z1 + eave)) < 1e-6, `${kind} south edge at ${b.z1}`);
  }
});

test("a pitched roof rises and a flat one does not", () => {
  const gable = bounds(roof({ ...BOX, kind: "gable", eave: 0.5, pitch: 0.6, parapet: 0 }));
  assert.ok(gable.y1 > BOX.y + 1, `a gable that rose ${gable.y1 - BOX.y} m is not a gable`);
  const flat = bounds(roof({ ...BOX, kind: "flat", eave: 0, pitch: 0, parapet: 0.7 }));
  assert.ok(Math.abs(flat.y1 - (BOX.y + 0.7)) < 1e-6, `a flat roof reached ${flat.y1 - BOX.y} m`);
});

test("a gable ridges along the LONG axis, so a terrace runs with the street", () => {
  const wide = roof({ x0: 0, z0: 0, x1: 12, z1: 6, y: 6, kind: "gable", eave: 0, pitch: 0.6 });
  const deep = roof({ x0: 0, z0: 0, x1: 6, z1: 12, y: 6, kind: "gable", eave: 0, pitch: 0.6 });
  // The ridge is the highest line; on a wide box it runs along x, on a deep
  // one along z. Take the spread of the topmost vertices in each axis.
  const ridgeAxis = (part) => {
    const p = part.position;
    let top = -Infinity;
    for (let i = 0; i < part.triangles * 3; i += 1) top = Math.max(top, p[i * 3 + 1]);
    let xs = 0; let zs = 0;
    let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
    for (let i = 0; i < part.triangles * 3; i += 1) {
      if (Math.abs(p[i * 3 + 1] - top) > 1e-6) continue;
      x0 = Math.min(x0, p[i * 3]); x1 = Math.max(x1, p[i * 3]);
      z0 = Math.min(z0, p[i * 3 + 2]); z1 = Math.max(z1, p[i * 3 + 2]);
    }
    xs = x1 - x0; zs = z1 - z0;
    return xs >= zs ? "x" : "z";
  };
  assert.equal(ridgeAxis(wide), "x");
  assert.equal(ridgeAxis(deep), "z");
});

test("a sawtooth has more than one tooth on a long shed", () => {
  const one = roof({ x0: 0, z0: 0, x1: 8, z1: 8, y: 6, kind: "sawtooth", eave: 0.3, pitch: 0.5 });
  const many = roof({ x0: 0, z0: 0, x1: 48, z1: 8, y: 6, kind: "sawtooth", eave: 0.3, pitch: 0.5 });
  assert.ok(many.triangles > one.triangles * 3, `${one.triangles} against ${many.triangles}`);
});

test("every normal is a unit vector", () => {
  for (const kind of ROOF_KINDS) {
    const part = roof({ ...BOX, kind, eave: 0.4, pitch: 0.6, parapet: 0.7 });
    for (let i = 0; i < part.triangles * 3; i += 1) {
      const n = Math.hypot(part.normal[i * 3], part.normal[i * 3 + 1], part.normal[i * 3 + 2]);
      assert.ok(Math.abs(n - 1) < 1e-5, `${kind} vertex ${i} has a normal of length ${n}`);
    }
  }
});

test("winding agrees with the normals, or half of it is culled (slice E3's lesson)", () => {
  for (const kind of ROOF_KINDS) {
    const part = roof({ ...BOX, kind, eave: 0.4, pitch: 0.6, parapet: 0.7 });
    const p = part.position;
    const n = part.normal;
    for (let t = 0; t < part.triangles; t += 1) {
      const i = t * 9;
      const ux = p[i + 3] - p[i]; const uy = p[i + 4] - p[i + 1]; const uz = p[i + 5] - p[i + 2];
      const vx = p[i + 6] - p[i]; const vy = p[i + 7] - p[i + 1]; const vz = p[i + 8] - p[i + 2];
      const cx = uy * vz - uz * vy;
      const cy = uz * vx - ux * vz;
      const cz = ux * vy - uy * vx;
      assert.ok(cx * n[i] + cy * n[i + 1] + cz * n[i + 2] > 0,
        `${kind} triangle ${t} is wound against its normal`);
    }
  }
});

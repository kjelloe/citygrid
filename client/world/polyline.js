// Polyline arithmetic the derived graphs share (slice E7).
//
// Two graphs are laid out along the same corridors now — the lane graph cars
// drive on (E1) and the nav graph people walk on (E7) — and both need the same
// four operations: offset a centre line sideways, cut a length off each end,
// pack a polyline into flat arrays with cumulative distances, and read a point
// and a tangent some way along it.
//
// Extracted from `lanes.js`, which is where they were written and where they
// were the only copy. The alternative was a second copy in `nav.js`, and a
// number written down twice is a defect waiting for the next edit — a lane that
// stops short of a junction and a pavement that does not is a pedestrian
// standing in the middle of a road.
//
// Pure, and in `client/world/`.

/** Right of a forward vector, in a y-up world where +x is east and +z south.
 * Travelling north (0, −1) the right hand points east (1, 0). */
export function rightOf(fx, fz) {
  return { x: -fz, z: fx };
}

/** Offsets a polyline sideways by `d` metres, mitring nothing: the corridors
 * these run along are straight between tile centres or already sampled curves,
 * so a per-point normal from the average of the two adjacent segments is
 * exact where it matters and never folds. */
export function offsetPolyline(points, d) {
  const out = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    let fx = b.x - a.x;
    let fz = b.z - a.z;
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;
    const r = rightOf(fx, fz);
    out.push({ x: points[i].x + r.x * d, z: points[i].z + r.z * d });
  }
  return out;
}

/** Walks `metres` in from one end of a polyline and returns the trimmed copy.
 * Used at both ends: a lane stops short of the junction it runs into, and
 * starts short of the one it comes out of, so the box in the middle belongs to
 * the connectors. */
export function trim(points, head, tail) {
  const pts = points.map((p) => ({ ...p }));
  const cut = (from) => {
    let left = from === "head" ? head : tail;
    while (left > 1e-9 && pts.length >= 2) {
      const i = from === "head" ? 0 : pts.length - 1;
      const j = from === "head" ? 1 : pts.length - 2;
      const seg = Math.hypot(pts[j].x - pts[i].x, pts[j].z - pts[i].z);
      if (seg > left + 1e-9) {
        const t = left / seg;
        pts[i] = { x: pts[i].x + (pts[j].x - pts[i].x) * t, z: pts[i].z + (pts[j].z - pts[i].z) * t };
        return;
      }
      pts.splice(i, 1);
      left -= seg;
    }
  };
  cut("head");
  cut("tail");
  return pts;
}

/** The length of a polyline, in metres. */
export function lengthOf(points) {
  let run = 0;
  for (let i = 1; i < points.length; i += 1) {
    run += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  return run;
}

/** Packs a polyline into `{ pts, cum, len }` with a height from `heightAt`.
 *
 * Flat arrays rather than objects: a frame samples these thousands of times and
 * an object per point is an allocation per sample.
 */
export function packWithHeight(points, heightAt, lift = 0) {
  const pts = new Float32Array(points.length * 3);
  const cum = new Float32Array(points.length);
  let run = 0;
  for (let i = 0; i < points.length; i += 1) {
    if (i > 0) run += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    cum[i] = run;
    pts[i * 3] = points[i].x;
    pts[i * 3 + 1] = heightAt(points[i].x, points[i].z) + lift;
    pts[i * 3 + 2] = points[i].z;
  }
  return { pts, cum, len: run };
}

/** Position and unit tangent `s` metres along a packed polyline, written into
 * `out` so a frame of a thousand samples allocates nothing. Clamped at both
 * ends. */
export function sampleAlong(packed, s, out) {
  const cum = packed.cum;
  const last = cum.length - 1;
  const d = s < 0 ? 0 : s > packed.len ? packed.len : s;
  let i = 1;
  while (i < last && cum[i] < d) i += 1;
  const span = cum[i] - cum[i - 1];
  const t = span > 1e-9 ? (d - cum[i - 1]) / span : 0;
  const a = (i - 1) * 3;
  const b = i * 3;
  out.x = packed.pts[a] + (packed.pts[b] - packed.pts[a]) * t;
  out.y = packed.pts[a + 1] + (packed.pts[b + 1] - packed.pts[a + 1]) * t;
  out.z = packed.pts[a + 2] + (packed.pts[b + 2] - packed.pts[a + 2]) * t;
  const tx = packed.pts[b] - packed.pts[a];
  const tz = packed.pts[b + 2] - packed.pts[a + 2];
  const len = Math.hypot(tx, tz) || 1;
  out.tx = tx / len;
  out.tz = tz / len;
  return out;
}

/** How far along a polyline the point nearest `(x, z)` is, and how far away it
 * is. Used to seat a door on the pavement it opens onto, and to work out where
 * on a lane a car has to stop for someone (E7, A45). */
export function closestAlong(packed, x, z) {
  let best = { s: 0, dist: Infinity };
  const n = packed.cum.length;
  for (let i = 1; i < n; i += 1) {
    const ax = packed.pts[(i - 1) * 3];
    const az = packed.pts[(i - 1) * 3 + 2];
    const bx = packed.pts[i * 3];
    const bz = packed.pts[i * 3 + 2];
    const dx = bx - ax;
    const dz = bz - az;
    const seg = dx * dx + dz * dz;
    const t = seg > 1e-12 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / seg)) : 0;
    const px = ax + dx * t;
    const pz = az + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (dist < best.dist) best = { s: packed.cum[i - 1] + Math.sqrt(seg) * t, dist };
  }
  return best;
}

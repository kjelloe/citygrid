// Where the street furniture stands, and what of it is solid (slice E7; A43).
//
// This was `client/render/props-l3.js`, which is where geometry belongs and is
// the wrong side of the layer for a collider: the collision world is in
// `client/world/` and may not import a renderer module (ruling 032). So the
// PLACEMENT lives here and the geometry stays there, which also means one
// function decides where a lamp is and both the picture and the walker read it
// — the alternative is two copies of the same arithmetic and a lamp you can
// walk through standing next to one you cannot.
//
// Bins are not solid. A43: lamps and hedges stop a walker, a bin is stepped
// over — and a bin that stopped one would be the thing everybody bumped into,
// because it is the only prop that stands where a person walks.

import { getConfig } from "./config.js";

/** Half the thickness of a lamp post and of a hedge, in metres. Both are the
 * collider's half-extent AND the geometry's, which is the point of this file. */
export const POST_HALF = 0.07;
export const HEDGE_HALF = 0.22;

/** How far from the centre line a lamp stands.
 *
 * `lampInset` out from the KERB, not half a pavement out from the middle of the
 * road. It was the latter — `half + sidewalk / 2` — which is the middle of the
 * pavement and therefore exactly the line a person walks down; with the posts
 * made solid, `walkthrough` stopped dead on one every 24 m (A43).
 */
export function lampOffset(cfg = getConfig()) {
  return cfg.road.width / 2 + cfg.props.lampInset;
}

/** Lamps along one corridor, alternating sides.
 *
 * `heightAt` places the foot; `offset` is how far from the centre line. Moved
 * from `render/props-l3.js` unchanged apart from its home.
 */
export function lampsAlong(points, offset, spacing, height, heightAt) {
  const out = [];
  if (!points || points.length < 2) return out;
  const cum = [0];
  for (let i = 1; i < points.length; i += 1) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  }
  const total = cum[cum.length - 1];
  let side = 1;
  for (let d = spacing / 2; d < total; d += spacing) {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i += 1;
    const a = points[i - 1];
    const b = points[i];
    const seg = cum[i] - cum[i - 1] || 1;
    const t = (d - cum[i - 1]) / seg;
    const px = a.x + (b.x - a.x) * t;
    const pz = a.z + (b.z - a.z) * t;
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = (-(b.z - a.z) / len) * offset * side;
    const nz = ((b.x - a.x) / len) * offset * side;
    const x = px + nx;
    const z = pz + nz;
    out.push({ x, z, y: heightAt(x, z), h: height, arm: -side, along: { x: (b.x - a.x) / len, z: (b.z - a.z) / len } });
    side = -side;
  }
  return out;
}

/**
 * A lot's hedge as two spans with a gate between them.
 *
 * `front` is the lot's street edge, `{ x0, z0, x1, z1 }`, running the way the
 * facade does. The gap is the path's width plus a shoulder, in the middle,
 * because a hedge with no way through it is a fence.
 */
export function hedgeSpans(front, props = getConfig().props) {
  const along = { x: front.x1 - front.x0, z: front.z1 - front.z0 };
  const len = Math.hypot(along.x, along.z) || 1;
  along.x /= len; along.z /= len;
  const gap = props.pathW + 0.6;
  const mid = len / 2;
  const spans = [];
  for (const [from, to] of [[0.2, mid - gap / 2], [mid + gap / 2, len - 0.2]]) {
    if (to - from < 0.4) continue;
    spans.push({
      ax: front.x0 + along.x * from, az: front.z0 + along.z * from,
      bx: front.x0 + along.x * to, bz: front.z0 + along.z * to,
    });
  }
  return spans;
}

/** Where a lot's path meets the pavement — the point a person comes out of a
 * building at, and where E5's path already reaches to (spec §6.6). */
export const PATH_REACH = 2.4;

export function doorPoint(front, out) {
  const mx = (front.x0 + front.x1) / 2;
  const mz = (front.z0 + front.z1) / 2;
  return { x: mx + out.x * PATH_REACH, z: mz + out.z * PATH_REACH };
}

/**
 * The colliders, as boxes the same shape as `collision.js`'s lot boxes.
 *
 * Lamps and hedges are handed in rather than re-derived, so the boxes are the
 * same objects the geometry was built from: `lamps` from `lampsAlong`, `fronts`
 * as lot street edges. `heightAt` seats them.
 *
 * A hedge overlaps the lot box it belongs to by all but `HEDGE_HALF`, so most
 * of what it adds is already solid. It is here anyway: the 0.22 m it does add
 * is the difference between brushing a hedge and walking through one, and a
 * lot with no building on it has no box at all.
 */
export function furnitureBoxes(model, lamps, fronts) {
  const cfg = getConfig();
  const heightAt = model.heightAt;
  const boxes = [];
  let id = 0;
  for (const lamp of lamps) {
    boxes.push({
      id: `lamp${id}`, kind: "lamp",
      x0: lamp.x - POST_HALF, x1: lamp.x + POST_HALF,
      z0: lamp.z - POST_HALF, z1: lamp.z + POST_HALF,
      yBase: lamp.y, yTop: lamp.y + lamp.h,
    });
    id += 1;
  }
  for (const front of fronts) {
    for (const span of hedgeSpans(front, cfg.props)) {
      const y = heightAt((span.ax + span.bx) / 2, (span.az + span.bz) / 2);
      boxes.push({
        id: `hedge${id}`, kind: "hedge",
        x0: Math.min(span.ax, span.bx) - HEDGE_HALF, x1: Math.max(span.ax, span.bx) + HEDGE_HALF,
        z0: Math.min(span.az, span.bz) - HEDGE_HALF, z1: Math.max(span.az, span.bz) + HEDGE_HALF,
        yBase: y, yTop: y + cfg.props.hedgeH,
      });
      id += 1;
    }
  }
  return boxes;
}

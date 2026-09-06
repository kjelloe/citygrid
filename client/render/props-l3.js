// The L3 prop pass (slice E5; spec §6.6).
//
// At L2 the props are instanced pools placed by hash on paved tiles. At L3 they
// go through the chunk baker, which is what lets a lamp also be a light
// position for the night rig (E6) and what lets a hedge follow the lot line
// rather than the tile grid.
//
// Pure, like the rest of the L3 kits: it takes a corridor's points and a lot's
// rectangle and gives back buffers. What it is FOR is that a street with a lamp
// and a hedge and a path to the door reads as a place, and the same street
// without them reads as a diagram — and none of that fails a test, so the
// things asserted here are the ones that do: a lamp on the pavement rather than
// in the carriageway, and nothing standing where the walker has to get past.

import { sink } from "./solid.js";

/** Lamps along one corridor, alternating sides.
 *
 * `heightAt` places the foot; `offset` is how far from the centre line, which
 * is the middle of the pavement — a lamp in the gutter is the version of this
 * that everyone notices.
 */
export function lamps(points, offset, spacing, height, heightAt) {
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

/** One lamp: a post, a bracket over the road, and a head. */
export function lampGeometry(s, lamp) {
  const { x, y, z, h } = lamp;
  s.box(x - 0.07, y, z - 0.07, x + 0.07, y + h, z + 0.07);
  const reach = 0.9 * lamp.arm;
  const nx = -lamp.along.z * reach;
  const nz = lamp.along.x * reach;
  s.box(
    Math.min(x, x + nx) - 0.05, y + h - 0.12, Math.min(z, z + nz) - 0.05,
    Math.max(x, x + nx) + 0.05, y + h, Math.max(z, z + nz) + 0.05,
  );
  s.box(x + nx - 0.24, y + h - 0.26, z + nz - 0.14, x + nx + 0.24, y + h - 0.12, z + nz + 0.14);
}

/**
 * The kerbside furniture of one lot: a hedge along the frontage with a gap for
 * the path, and the path itself.
 *
 * `front` is the lot's street edge as `{ x0, z0, x1, z1 }` in world metres and
 * `out` is the outward normal of that edge.
 */
export function frontage(hedgeSink, pathSink, lot, out, cfg, heightAt) {
  const s = hedgeSink;
  const { hedgeH, pathW } = cfg;
  const along = { x: lot.x1 - lot.x0, z: lot.z1 - lot.z0 };
  const len = Math.hypot(along.x, along.z) || 1;
  along.x /= len; along.z /= len;
  const gap = pathW + 0.6;
  const mid = len / 2;
  for (const [from, to] of [[0.2, mid - gap / 2], [mid + gap / 2, len - 0.2]]) {
    if (to - from < 0.4) continue;
    const ax = lot.x0 + along.x * from;
    const az = lot.z0 + along.z * from;
    const bx = lot.x0 + along.x * to;
    const bz = lot.z0 + along.z * to;
    const y = heightAt((ax + bx) / 2, (az + bz) / 2);
    s.box(
      Math.min(ax, bx) - 0.22, y, Math.min(az, bz) - 0.22,
      Math.max(ax, bx) + 0.22, y + hedgeH, Math.max(az, bz) + 0.22,
    );
  }
  // The path: from the gap in the hedge out to the pavement. Its own sink,
  // because a green path is a lawn and a stone hedge is a wall.
  const px = lot.x0 + along.x * mid;
  const pz = lot.z0 + along.z * mid;
  const reach = 2.4;
  const y = heightAt(px, pz);
  pathSink.box(
    Math.min(px, px + out.x * reach) - pathW / 2, y - 0.04, Math.min(pz, pz + out.z * reach) - pathW / 2,
    Math.max(px, px + out.x * reach) + pathW / 2, y + 0.02, Math.max(pz, pz + out.z * reach) + pathW / 2,
  );
}

/** A bin. Small, and the only reason it is here is that a street with nothing
 * on the pavement reads as a render rather than a place. */
export function bin(s, x, y, z) {
  s.box(x - 0.24, y, z - 0.24, x + 0.24, y + 0.9, z + 0.24);
}

/** Everything, as pieces. `lots` are the lots whose frontage is in this chunk. */
export function buildProps({ corridors, lots, cfg, heightAt, palette }) {
  const metal = sink();
  const green = sink();
  const stone = sink();
  const all = [];
  const half = cfg.road.width / 2;
  const offset = half + cfg.road.sidewalk / 2;
  let placed = 0;
  for (const points of corridors) {
    for (const lamp of lamps(points, offset, cfg.props.lampSpacing, cfg.props.lampH, heightAt)) {
      lampGeometry(metal, lamp);
      placed += 1;
      if (placed % Math.max(1, Math.round(cfg.props.binEvery / cfg.props.lampSpacing)) === 0) {
        bin(metal, lamp.x + 1.2, lamp.y, lamp.z);
      }
    }
  }
  for (const { lot, out, kind } of lots) {
    if (kind !== "residential") continue;
    frontage(green, stone, lot, out, cfg.props, heightAt);
  }
  all.push({ part: metal.done(), colour: palette.lamp });
  all.push({ part: green.done(), colour: palette.lawn });
  all.push({ part: stone.done(), colour: palette.civic });
  return all.filter((p) => p.part.triangles > 0);
}

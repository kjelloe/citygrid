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
// WHERE a lamp or a hedge is now lives in `client/world/` — the collision world
// reads the same functions, and it cannot import a renderer module (E7, A43).
import {
  lampsAlong, lampOffset, hedgeSpans, POST_HALF, HEDGE_HALF,
} from "../world/street-furniture.js";

export { lampsAlong as lamps };

/** One lamp: a post, a bracket over the road, and a head. */
export function lampGeometry(s, lamp) {
  const { x, y, z, h } = lamp;
  s.box(x - POST_HALF, y, z - POST_HALF, x + POST_HALF, y + h, z + POST_HALF);
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
export function frontage(hedgeSink, pathSink, lot, out, cfg, heightAt, fence = "hedge") {
  const s = hedgeSink;
  const { hedgeH, pathW } = cfg;
  const along = { x: lot.x1 - lot.x0, z: lot.z1 - lot.z0 };
  const len = Math.hypot(along.x, along.z) || 1;
  along.x /= len; along.z /= len;
  const mid = len / 2;
  // The SPANS come from `world/street-furniture.js`, which is also what the
  // collision world turns into hedge boxes (E7, A43). Two copies of "where the
  // gate is" is a hedge you can see through and not walk through.
  // A fence TYPE per house variant (S5, `fenceOf`): a hedge, a low wall, or a
  // picket — posts and a rail — on the same spans. The spans do not change, so
  // what a walker bumps into is what is drawn, whichever it is.
  for (const span of hedgeSpans(lot, cfg)) {
    const { ax, az, bx, bz } = span;
    const y = heightAt((ax + bx) / 2, (az + bz) / 2);
    if (fence === "picket") {
      // A post every three metres, not every 1.2: at 1.2 the pickets were most
      // of the 10% more triangles a chunk baked in S5, and the bake check read
      // 9–10 ms against its 8. A post and a rail still read as a fence.
      const run = Math.hypot(bx - ax, bz - az);
      const posts = Math.max(2, Math.round(run / 3) + 1);
      for (let k = 0; k < posts; k += 1) {
        const px = ax + ((bx - ax) * k) / (posts - 1);
        const pz = az + ((bz - az) * k) / (posts - 1);
        pathSink.box(px - 0.05, y, pz - 0.05, px + 0.05, y + 0.9, pz + 0.05);
      }
      pathSink.box(
        Math.min(ax, bx) - 0.03, y + 0.62, Math.min(az, bz) - 0.03,
        Math.max(ax, bx) + 0.03, y + 0.72, Math.max(az, bz) + 0.03,
      );
      continue;
    }
    const top = fence === "wall" ? hedgeH * 0.55 : hedgeH;
    (fence === "wall" ? pathSink : s).box(
      Math.min(ax, bx) - HEDGE_HALF, y, Math.min(az, bz) - HEDGE_HALF,
      Math.max(ax, bx) + HEDGE_HALF, y + top, Math.max(az, bz) + HEDGE_HALF,
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

/**
 * Everything, as `{ pieces, lamps }`.
 *
 * The lamp POSITIONS come back as well as their geometry: at night the nearest
 * few of them become real point lights (spec §7.3) and the rest stay emissive,
 * and the night rig needs to know where they are without re-deriving them from
 * the geometry it was handed.
 */
export function buildProps({ corridors, lots, cfg, heightAt, palette, chunk = 0 }) {
  const metal = sink();
  const green = sink();
  const stone = sink();
  const all = [];
  const offset = lampOffset(cfg);
  const placed_ = [];
  let placed = 0;
  for (const points of corridors) {
    for (const lamp of lampsAlong(points, offset, cfg.props.lampSpacing, cfg.props.lampH, heightAt)) {
      lampGeometry(metal, lamp);
      // Where the light hangs: the head, on the end of the bracket.
      placed_.push({
        id: chunk * 4096 + placed_.length,
        x: lamp.x - lamp.along.z * 0.9 * lamp.arm,
        y: lamp.y + lamp.h - 0.2,
        z: lamp.z + lamp.along.x * 0.9 * lamp.arm,
      });
      placed += 1;
      if (placed % Math.max(1, Math.round(cfg.props.binEvery / cfg.props.lampSpacing)) === 0) {
        bin(metal, lamp.x + 1.2, lamp.y, lamp.z);
      }
    }
  }
  for (const { lot, out, kind, fence } of lots) {
    if (kind !== "residential") continue;
    frontage(green, stone, lot, out, cfg.props, heightAt, fence);
  }
  all.push({ part: metal.done(), colour: palette.lamp });
  all.push({ part: green.done(), colour: palette.lawn });
  all.push({ part: stone.done(), colour: palette.civic });
  return { pieces: all.filter((p) => p.part.triangles > 0), lamps: placed_ };
}

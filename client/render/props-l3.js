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
  lampsAlong, lampOffset, hedgeSpans, POST_HALF, HEDGE_HALF, BAY_LEN,
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
/** An axis-aligned box `w` along `along`, `d` across it, `h` tall, centred on (x, z). */
function turnedBox(s, x, y, z, along, w, d, h) {
  const alongX = !along || Math.abs(along.x) >= Math.abs(along.z);
  const [hx, hz] = alongX ? [w / 2, d / 2] : [d / 2, w / 2];
  s.box(x - hx, y, z - hz, x + hx, y + h, z + hz);
}

/**
 * One S3 prop (`street-furniture.js` placed it; this only draws it). Heights:
 * a thing in the carriageway on the road surface, a thing on the pavement on
 * the kerb, a thing in a shop's forecourt on the ground.
 */
export function streetPropGeometry(sinks, prop, cfg, heightAt) {
  const ground = heightAt(prop.x, prop.z);
  const road = ground + cfg.road.lift + 0.006;
  const kerb = ground + cfg.road.lift + cfg.road.kerb;
  const { metal, dark, red, wood } = sinks;
  if (prop.kind === "bollard") turnedBox(metal, prop.x, kerb, prop.z, undefined, 0.2, 0.2, 0.9);
  else if (prop.kind === "sign") turnedBox(metal, prop.x, kerb, prop.z, undefined, 0.12, 0.12, 2.6);
  else if (prop.kind === "postbox") {
    turnedBox(red, prop.x, kerb, prop.z, undefined, 0.5, 0.5, 1.0);
    turnedBox(dark, prop.x, kerb + 1.0, prop.z, undefined, 0.56, 0.56, 0.08);
  } else if (prop.kind === "bench") {
    turnedBox(wood, prop.x, ground + 0.42, prop.z, prop.along, 1.6, 0.45, 0.06);
    const bx = prop.x - (prop.along ? -prop.along.z : 0) * 0.2;
    const bz = prop.z - (prop.along ? prop.along.x : 0) * 0.2;
    turnedBox(wood, bx, ground + 0.48, bz, prop.along, 1.6, 0.06, 0.4);
    turnedBox(dark, prop.x, ground, prop.z, prop.along, 1.4, 0.35, 0.42);
  } else if (prop.kind === "bikerack") {
    for (const k of [-0.45, 0.45]) {
      const ox = (prop.along?.x ?? 1) * k;
      const oz = (prop.along?.z ?? 0) * k;
      turnedBox(metal, prop.x + ox, ground, prop.z + oz, prop.along, 0.06, 0.7, 0.8);
    }
  } else if (prop.kind === "manhole") flatQuad(dark, prop.x, road, prop.z, undefined, 0.7, 0.7);
  else if (prop.kind === "drain") flatQuad(dark, prop.x, road, prop.z, prop.along, 0.6, 0.3);
}

/** A flat quad facing up, `w` along `along` and `d` across — two triangles
 * where a box is twelve (S9's lesson: a thing with no thickness anybody can see
 * is a quad). */
function flatQuad(s, x, y, z, along, w, d) {
  const alongX = !along || Math.abs(along.x) >= Math.abs(along.z);
  const [hx, hz] = alongX ? [w / 2, d / 2] : [d / 2, w / 2];
  s.quad([x - hx, y, z - hz], [x + hx, y, z - hz], [x + hx, y, z + hz], [x - hx, y, z + hz]);
}

/** A parking bay: its surface and a line at each end, all flat. */
function bayGeometry(surface, lines, bay, heightAt) {
  const y = heightAt(bay.x, bay.z) + 0.03;
  flatQuad(surface, bay.x, y, bay.z, bay.along, BAY_LEN, 2.6);
  for (const end of [-1, 1]) {
    const ex = bay.x + bay.along.x * end * (BAY_LEN / 2 - 0.05);
    const ez = bay.z + bay.along.z * end * (BAY_LEN / 2 - 0.05);
    flatQuad(lines, ex, y + 0.005, ez, bay.along, 0.1, 2.6);
  }
}

export function buildProps({ corridors, lots, cfg, heightAt, palette, chunk = 0, street = { props: [], bays: [] } }) {
  const metal = sink();
  const green = sink();
  const stone = sink();
  // S3's street props and bays, in their own colours.
  const dark = sink();
  const red = sink();
  const wood = sink();
  const baySurface = sink();
  const bayLines = sink();
  for (const prop of street.props) streetPropGeometry({ metal, dark, red, wood }, prop, cfg, heightAt);
  for (const bay of street.bays) bayGeometry(baySurface, bayLines, bay, heightAt);
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
  all.push({ part: dark.done(), colour: 0x3b3d40 });
  all.push({ part: red.done(), colour: 0xb0302a });
  all.push({ part: wood.done(), colour: 0x7a5a3c });
  all.push({ part: baySurface.done(), colour: palette.road });
  all.push({ part: bayLines.done(), colour: palette.roadMark ?? 0xd8d4c8 });
  return { pieces: all.filter((p) => p.part.triangles > 0), lamps: placed_ };
}

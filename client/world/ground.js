// The one height function (ruling 038; specs/engine/04-city-model.md §4.2).
//
// Everything that stands on the ground asks this: the terrain mesh, every
// ribbon, prop, marking and overlay quad, the seat of every building, the
// walker's feet. Nothing decides for itself what the ground is doing — the
// failure that prevents is invisible in a screenshot and fatal on foot.
//
// Three layers, in this order:
//   1. the land — bilinear over tile-corner heights, a corner being the mean
//      of the four tiles that meet there, exactly as terrain.js draws it;
//   2. corridor flattening — inside a road's half-width the ground is the
//      road's own centreline height, blended out smoothly so the field has no
//      crease for the ink pass to find;
//   3. water — a water tile never rises above the water level.

import { getConfig } from "./config.js";
import { TERRAIN_WATER, TERRAIN_SHALLOW } from "../constants-mirror.js";
import { closestOnPolyline } from "./corridors.js";

function sstep(a, b, v) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a || 1e-6)));
  return t * t * (3 - 2 * t);
}

export function createGround(state, network) {
  const cfg = getConfig();
  const tileM = cfg.tileM;
  const reliefM = cfg.reliefM;
  const { width, height } = state;
  const elevation = state.tiles.elevation;
  const terrain = state.tiles.terrain;

  const tileHeight = (x, y) => {
    const cx = Math.max(0, Math.min(width - 1, x));
    const cy = Math.max(0, Math.min(height - 1, y));
    return elevation[cy * width + cx] * reliefM;
  };
  const cornerHeight = (x, y) => (tileHeight(x - 1, y - 1) + tileHeight(x, y - 1)
    + tileHeight(x - 1, y) + tileHeight(x, y)) / 4;

  let waterLevel = -Infinity;
  for (let i = 0; i < terrain.length; i += 1) {
    if (terrain[i] === TERRAIN_WATER || terrain[i] === TERRAIN_SHALLOW) {
      waterLevel = Math.max(waterLevel, elevation[i] * reliefM);
    }
  }

  /** The bare land, metres. */
  function landAt(x, z) {
    const u = x / tileM;
    const v = z / tileM;
    const i = Math.max(0, Math.min(width, Math.floor(u)));
    const j = Math.max(0, Math.min(height, Math.floor(v)));
    const tx = Math.max(0, Math.min(1, u - i));
    const tz = Math.max(0, Math.min(1, v - j));
    const h00 = cornerHeight(i, j);
    const h10 = cornerHeight(i + 1, j);
    const h01 = cornerHeight(i, j + 1);
    const h11 = cornerHeight(i + 1, j + 1);
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  function tileOf(x, z) {
    const tx = Math.floor(x / tileM);
    const ty = Math.floor(z / tileM);
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) return -1;
    return ty * width + tx;
  }

  const blend = cfg.road.blend;

  /** The ground, corridors and water applied. */
  function heightAt(x, z) {
    const land = landAt(x, z);
    let wsum = 0;
    let hsum = 0;
    if (network) {
      for (const c of network.corridors) {
        const b = c.box;
        if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
        const hit = closestOnPolyline(c.points, x, z);
        if (hit.dist > c.half + blend) continue;
        const w0 = 1 - sstep(c.half, c.half + blend, hit.dist);
        // weight squared sharpens the junction blend: two corridors crossing
        // average cleanly, one merely passing nearby does not drag the other
        const w = w0 * w0;
        wsum += w;
        hsum += w * landAt(hit.x, hit.z);
      }
      for (const n of network.nodes) {
        if (n.corridors.length > 0 && n.kind !== "isolated") continue;
        const d = Math.max(Math.abs(x - n.x), Math.abs(z - n.z));
        if (d > network.half + blend) continue;
        const w0 = 1 - sstep(network.half, network.half + blend, d);
        wsum += w0 * w0;
        hsum += w0 * w0 * landAt(n.x, n.z);
      }
    }
    // A smooth hand-off rather than a clamp at wsum = 1: a kink in the height
    // field is a crease, and a crease is a line the ink pass draws.
    const wBase = Math.exp(-6 * wsum);
    let h = (hsum + land * wBase) / (wsum + wBase);
    const tile = tileOf(x, z);
    if (tile >= 0 && (terrain[tile] === TERRAIN_WATER || terrain[tile] === TERRAIN_SHALLOW)) {
      h = Math.min(h, waterLevel);
    }
    return h;
  }

  function normalAt(x, z, e = 0.5) {
    const hx = heightAt(x + e, z) - heightAt(x - e, z);
    const hz = heightAt(x, z + e) - heightAt(x, z - e);
    const nx = -hx / (2 * e);
    const nz = -hz / (2 * e);
    const len = Math.hypot(nx, 1, nz);
    return { x: nx / len, y: 1 / len, z: nz / len };
  }

  return { landAt, heightAt, normalAt, waterLevel, tileOf };
}

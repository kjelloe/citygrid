// Where the water is, how deep, and what its surface is (slice E8; spec §5.5).
//
// Water has never been built. A water tile was a terrain COLOUR whose height was
// clamped to a single global `waterLevel`, so at street level a lake was a flat
// blue floor the walker strolled across.
//
// Two things came out of looking at that instead of at the colour:
//
//   - **The level is per body, not per map.** `waterLevel` was the maximum land
//     height of any water tile anywhere; on the `rolling` fixture that is 47.5 m
//     while the same river's lowest tile is at 14 m, so a river running down a
//     valley was drawn as a plateau at the height of its highest tile for half
//     its length. Every water tile carries its own surface — its own land
//     height — which makes a lake level by construction (its tiles share an
//     elevation) and lets a river step down its valley, which is what a river
//     does at twenty metres a tile.
//   - **The bed has to drop.** A surface and a floor at the same height is not
//     water, it is a blue field. The shoreline is then geometry rather than a
//     colour: it is where the bed comes up through the surface.
//
// Pure, and in `client/world/`.

import { getConfig } from "./config.js";
import { TERRAIN_WATER, TERRAIN_SHALLOW } from "../constants-mirror.js";

const DIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * The water in one state.
 *
 * `levelOf(tile)` is the surface, `depthOf(tile)` how far the bed is below it.
 * Depth is a flood outward from the shore rather than a constant: a tile that
 * touches land is at the surface and the bed falls away over `water.shelf`
 * tiles, so a beach is a beach and not a step the height of the water.
 */
export function deriveWater(state, cfg = getConfig()) {
  const { width, height } = state;
  const terrain = state.tiles.terrain;
  const elevation = state.tiles.elevation;
  const reliefM = cfg.reliefM;
  const { depth: maxDepth, shelf } = cfg.water;
  const tileM = cfg.tileM;

  const wet = (i) => terrain[i] === TERRAIN_WATER || terrain[i] === TERRAIN_SHALLOW;

  const tiles = [];
  for (let i = 0; i < terrain.length; i += 1) if (wet(i)) tiles.push(i);

  // How many tiles from dry land, as a flood — the same shape as
  // `ground-colour.js`'s distance-to-street, and for the same reason: the
  // answer is per tile and a per-tile query into a global search is the
  // expensive way round.
  const rings = new Uint8Array(terrain.length).fill(255);
  let front = [];
  for (const i of tiles) {
    const x = i % width;
    const y = (i - x) / width;
    let touchesLand = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    for (const [dx, dy] of DIR) {
      if (touchesLand) break;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (!wet(ny * width + nx)) touchesLand = true;
    }
    if (touchesLand) { rings[i] = 0; front.push(i); }
  }
  for (let ring = 1; front.length > 0 && ring <= shelf + 1; ring += 1) {
    const next = [];
    for (const i of front) {
      const x = i % width;
      const y = (i - x) / width;
      for (const [dx, dy] of DIR) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (!wet(j) || rings[j] !== 255) continue;
        rings[j] = ring;
        next.push(j);
      }
    }
    front = next;
  }
  // Anything the flood never reached is open water.
  for (const i of tiles) if (rings[i] === 255) rings[i] = shelf + 1;

  // The surface, capped at the bank and levelled across the channel (S4).
  //
  // E8 made the level a tile's own land height, which is right for a lake and
  // wrong wherever the land beside the water is LOWER: on five generated seeds
  // about half of every shore pair had the water at or above its dry neighbour,
  // which is a river painted across a hillside. So a tile's surface is at most
  // the lowest dry land it touches, and then the lowest of that over the tiles
  // within one step, which levels a channel across its width without flattening
  // the fall along its length — a river still steps down its valley (E8).
  const level = new Float64Array(terrain.length);
  for (const i of tiles) {
    const x = i % width;
    const y = (i - x) / width;
    let cap = elevation[i] * reliefM;
    // All eight, not four: a corner-on neighbour is land the surface would sit
    // over just as visibly, and four left one tile of the river on seed 1003
    // drawn across dry ground.
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (!wet(j)) cap = Math.min(cap, elevation[j] * reliefM);
      }
    }
    level[i] = cap;
  }
  const capped = Float64Array.from(level);
  for (const i of tiles) {
    const x = i % width;
    const y = (i - x) / width;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (wet(j)) level[i] = Math.min(level[i], capped[j]);
      }
    }
  }

  function levelOf(tile) {
    if (tile < 0 || tile >= terrain.length || !wet(tile)) return undefined;
    return level[tile];
  }

  /** How far a point is from dry land, in TILES, on a half-tile lattice.
   *
   * Filled on first ask, like the ground's corners. A lattice of tile CORNERS
   * cannot hold this: every corner of a one-tile channel touches dry land, so
   * the whole channel would read zero and a river a tile wide would have no bed
   * at all. Half a tile can — the deepest point of that channel is its middle.
   */
  let far;
  const LAT = (width * 2 + 1);
  function distanceField() {
    if (far) return far;
    far = new Float32Array(LAT * (height * 2 + 1)).fill(-1);
    const queue = [];
    for (let j = 0; j <= height * 2; j += 1) {
      for (let i = 0; i <= width * 2; i += 1) {
        // The tiles this lattice point touches: one if it is a tile's middle,
        // two on an edge, four on a corner. Dry land anywhere among them is the
        // shoreline, and the shoreline is where the bed meets the surface.
        const x0 = Math.floor((i - 1) / 2);
        const x1 = Math.floor(i / 2);
        const y0 = Math.floor((j - 1) / 2);
        const y1 = Math.floor(j / 2);
        let dry = false;
        for (let ty = y0; ty <= y1 && !dry; ty += 1) {
          for (let tx = x0; tx <= x1 && !dry; tx += 1) {
            if (tx < 0 || ty < 0 || tx >= width || ty >= height) dry = true;
            else if (!wet(ty * width + tx)) dry = true;
          }
        }
        if (dry) { far[j * LAT + i] = 0; queue.push(j * LAT + i); }
      }
    }
    for (let head = 0; head < queue.length; head += 1) {
      const at = queue[head];
      const i = at % LAT;
      const j = (at - i) / LAT;
      for (const [dx, dy] of DIR) {
        const ni = i + dx;
        const nj = j + dy;
        if (ni < 0 || nj < 0 || ni > width * 2 || nj > height * 2) continue;
        const k = nj * LAT + ni;
        if (far[k] >= 0) continue;
        far[k] = far[at] + 0.5;
        queue.push(k);
      }
    }
    return far;
  }

  /** The depth at a POINT, metres (S4).
   *
   * `depthOf` is per tile and stays what E8 made it — the walker's rule and the
   * beach both read it. The BED is geometry, and geometry is continuous: a
   * river two tiles wide is all shore by the per-tile rule, depth 0 at both, so
   * it was drawn as a flat blue strip at the height of its banks.
   */
  function depthAt(x, z) {
    const d = distanceField();
    const u = Math.max(0, Math.min(width * 2, (x / tileM) * 2));
    const v = Math.max(0, Math.min(height * 2, (z / tileM) * 2));
    const i = Math.min(width * 2 - 1, Math.floor(u));
    const j = Math.min(height * 2 - 1, Math.floor(v));
    const tx = u - i;
    const tz = v - j;
    const at = (a, b) => Math.max(0, d[b * LAT + a]);
    const top = at(i, j) * (1 - tx) + at(i + 1, j) * tx;
    const bottom = at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx;
    const tilesFromLand = top * (1 - tz) + bottom * tz;
    return maxDepth * Math.min(1, tilesFromLand / Math.max(1e-6, shelf));
  }

  function depthOf(tile) {
    if (tile < 0 || tile >= terrain.length || !wet(tile)) return 0;
    return maxDepth * Math.min(1, rings[tile] / Math.max(1, shelf));
  }

  return {
    tiles,
    isWater: (tile) => tile >= 0 && tile < terrain.length && wet(tile),
    levelOf,
    depthOf,
    depthAt,
    /** The surface at a tile CORNER: the mean of the water that meets there, so
     * the sheet is continuous and a lake is one plane (S4's amendment). The
     * quad-per-tile surface showed its tiles as seams and a cross-hatch. */
    cornerLevelAt(cx, cy) {
      let sum = 0;
      let n = 0;
      for (let ty = cy - 1; ty <= cy; ty += 1) {
        for (let tx = cx - 1; tx <= cx; tx += 1) {
          if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
          const j = ty * width + tx;
          if (!wet(j)) continue;
          sum += level[j];
          n += 1;
        }
      }
      return n === 0 ? undefined : sum / n;
    },
    /** The bed under a water tile: the surface less its depth. */
    bedOf: (tile) => {
      const level = levelOf(tile);
      return level === undefined ? undefined : level - depthOf(tile);
    },
    /** Which chunks have any water in them, as `"cx,cy"` keys — one surface
     * mesh each, and none at all for a landlocked map. */
    chunksWithWater(chunkTiles) {
      const keys = new Set();
      for (const i of tiles) {
        const x = i % width;
        const y = (i - x) / width;
        keys.add(`${Math.floor(x / chunkTiles)},${Math.floor(y / chunkTiles)}`);
      }
      return keys;
    },
  };
}

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

  function levelOf(tile) {
    if (tile < 0 || tile >= terrain.length || !wet(tile)) return undefined;
    return elevation[tile] * reliefM;
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

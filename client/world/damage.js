// What damage looks like (slice B1b; the renderer half of B1, A62).
//
// The engine has two damage states and the world has shown neither: a building
// on fire looked like its neighbours, and the burnt ground it leaves was one
// flat grey slab a tile at city zoom and nothing at all at street level.
//
// **Both are read from the TILE flags, and that is the finding this module was
// written around.** A building record carries a `flags` field: `development.js`
// creates it as 0 and `state.js` hashes it, and nothing in the engine has ever
// written to it. So `instances.js`'s `building.flags & FLAG_BURNING` has been
// false since S6 — the smoke that spec §9.4b describes rising from any burning
// building has never drawn once — and the same test in `signals.js` and
// `street-furniture.js` has never excluded a thing. The tile layer is where
// `engine/fire.js` puts the truth, and this lane may not touch `engine/`
// (ruling 037), so this is where the renderer reads it.
//
// Pure, node-loadable, and the judgements live here rather than in the two
// renderers, so the instanced box and the baked facade agree by construction.

import { jitter } from "./hash.js";
import { FLAG_BURNING, FLAG_RUINED } from "../constants-mirror.js";

/** A ruin's shape, in metres. One storey of wall, and rubble below the sill —
 * the point is that you can see over it into an empty plot. */
export const RUIN = Object.freeze({
  wallM: 2.6,
  /** The lowest a standing piece of wall goes before it is simply gone. */
  stumpM: 0.7,
  rubbleM: 0.9,
  /** Of the outline, how much has fallen. A complete box is a building with
   * its roof taken off, which is not what a burnt-out house looks like. */
  fallen: 0.28,
});

/** Charred, and glowing. The colours are here rather than in a palette because
 * they are a STATE, not a style: a burnt wall is the same burnt wall in plain,
 * pixel and painted, and both renderers have to agree about it. */
export const CHAR = 0x352f2b;
export const EMBER = 0xc0532a;

const mix = (a, b, t) => {
  const k = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (Math.round(ar + (br - ar) * k) << 16)
    | (Math.round(ag + (bg - ag) * k) << 8)
    | Math.round(ab + (bb - ab) * k);
};

/** A wall with fire behind it: the building's own colour pushed toward ember,
 * not replaced by it — a burning brick house is still a brick house. */
export function emberTint(colour) {
  return mix(colour, EMBER, 0.45);
}

/** What is left of a wall that burned.
 *
 * The strength matters more than it looks: burnt GROUND is nearly black, and a
 * wall charred by the same amount standing on it is a black shape on a black
 * patch, which is what the first cut of B1b drew — the walls were there, and a
 * magenta test shot is what proved it. Masonry that survived a fire is grey.
 */
export function charTint(colour, strength = 0.75) {
  return mix(colour, CHAR, strength);
}

const at = (state, x, y) => (x < 0 || y < 0 || x >= state.width || y >= state.height
  ? 0 : state.tiles.flags[y * state.width + x]);

/** Is this building's own ground alight? */
export function isBurning(state, building) {
  for (let dy = 0; dy < (building.h ?? 1); dy += 1) {
    for (let dx = 0; dx < (building.w ?? 1); dx += 1) {
      if ((at(state, building.x + dx, building.y + dy) & FLAG_BURNING) !== 0) return true;
    }
  }
  return false;
}

/** Every burnt-out plot with a tile inside the window, as connected ruins.
 *
 * A ruin is what is left of a BUILDING, so the shape to draw is the footprint
 * it stood on — four tiles of one house is one ruin and not four slabs. The
 * building record is gone by then (`fire.js` splices it out), so the tiles are
 * all that is left to read.
 */
export function ruinPlots(state, x0, y0, x1, y1) {
  const wet = (x, y) => (at(state, x, y) & FLAG_RUINED) !== 0;
  const seen = new Set();
  const plots = [];
  for (let y = Math.max(0, y0); y < Math.min(state.height, y1); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(state.width, x1); x += 1) {
      if (!wet(x, y) || seen.has(y * state.width + x)) continue;
      // The whole connected ruin, even the part outside the window: half a
      // ruin drawn at a chunk boundary is a wall that stops in mid air.
      const tiles = [];
      const queue = [[x, y]];
      seen.add(y * state.width + x);
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      while (queue.length > 0) {
        const [cx, cy] = queue.pop();
        tiles.push(cy * state.width + cx);
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          const key = ny * state.width + nx;
          if (!wet(nx, ny) || seen.has(key)) continue;
          seen.add(key);
          queue.push([nx, ny]);
        }
      }
      tiles.sort((a, b) => a - b);
      // `width` travels with the plot: a tile index means nothing without the
      // map width it was made with, and every reader here has the plot.
      plots.push({ tiles, width: state.width, x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1, id: tiles[0] });
    }
  }
  return plots;
}

/** The standing walls: the plot's own outline, broken in places.
 *
 * Every segment is one tile side, so the outline of an L-shaped ruin follows
 * the L. Heights come from the tile and the side, so a ruin looks the same in
 * every frame and in both renderers.
 */
export function ruinWalls(plot) {
  const walls = [];
  const width = plot.width;
  const own = new Set(plot.tiles);
  const has = (x, y) => own.has(y * width + x);
  for (const tile of plot.tiles) {
    const x = tile % width;
    const y = (tile - x) / width;
    const sides = [
      { dx: 0, dy: -1, x0: x, y0: y, x1: x + 1, y1: y },
      { dx: 1, dy: 0, x0: x + 1, y0: y, x1: x + 1, y1: y + 1 },
      { dx: 0, dy: 1, x0: x, y0: y + 1, x1: x + 1, y1: y + 1 },
      { dx: -1, dy: 0, x0: x, y0: y, x1: x, y1: y + 1 },
    ];
    for (const [k, side] of sides.entries()) {
      if (has(x + side.dx, y + side.dy)) continue;
      const roll = jitter(tile, 101 + k * 7);
      if (roll < RUIN.fallen) continue;
      // What is left standing, between a stump and one storey.
      const height = RUIN.stumpM + (RUIN.wallM - RUIN.stumpM) * jitter(tile, 131 + k * 11);
      walls.push({ x0: side.x0, y0: side.y0, x1: side.x1, y1: side.y1, height });
    }
  }
  return walls;
}

/** Where the building went: broken pieces on the plot, below the sill. */
export function rubbleOf(plot) {
  const pieces = [];
  const width = plot.width;
  for (const tile of plot.tiles) {
    const x = tile % width;
    const y = (tile - x) / width;
    // Two a tile, which is enough to read as rubble and cheap enough to draw on
    // every ruin in a city (per-thing costs multiply — S9's lesson).
    for (let k = 0; k < 2; k += 1) {
      pieces.push({
        x: x + 0.2 + 0.6 * jitter(tile, 151 + k * 13),
        y: y + 0.2 + 0.6 * jitter(tile, 173 + k * 17),
        h: 0.2 + (RUIN.rubbleM - 0.2) * jitter(tile, 191 + k * 19),
        turn: jitter(tile, 211 + k * 23) * Math.PI,
      });
    }
  }
  return pieces;
}

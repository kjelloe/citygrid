// The countryside (slice S2, D4 finding 2).
//
// Beyond the built area the land was one flat green: a town with no edge,
// sitting on a colour chart. Here, open grass far enough from anything a player
// has built becomes FIELDS — blocks of `FIELD_BLOCK` tiles, each a meadow or a
// striped crop, with hedgerows along some of the edges between them and a farm
// track now and then — so the town sits in a landscape and has a silhouette.
//
// Pure and derived: a function of the tile, its distance to anything built and
// the map's seed. Nothing is stored and nothing is hashed, so two clients draw
// the same farms and a screenshot is the same picture twice (ruling 032).

import { NET_PRESENT, TERRAIN_GRASS } from "../constants-mirror.js";
import { jitter } from "./hash.js";

/** How many tiles from a road, a zone or a building before grass is a field.
 * Right up against a street a field reads as a vacant lot. */
export const FIELD_REACH = 3;
/** A field is this many tiles on a side (80 m at 20 m a tile). */
export const FIELD_BLOCK = 4;
/** And no further than this from the town: farmland rings a town, and beyond
 * it is meadow. A map with nothing built on it has no farms at all. */
export const FIELD_RANGE = 12;

const SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const CROP_SHARE = 0.6;
const HEDGE_SHARE = 0.6;
const TRACK_SHARE = 0.08;

export function createCountryside(state) {
  const { width, height } = state;
  const seed = (state.options?.seed ?? 0) >>> 0;

  // Distance to anything built, in tiles (Chebyshev), capped past FIELD_RANGE:
  // one flood outward from every built tile.
  const far = FIELD_RANGE + 1;
  const near = new Uint8Array(width * height).fill(far);
  let front = [];
  for (let i = 0; i < width * height; i += 1) {
    const built = (state.tiles.road[i] & NET_PRESENT) !== 0 || state.tiles.zone[i] !== 0
      || state.tiles.buildingId[i] !== 0;
    if (built) { near[i] = 0; front.push(i); }
  }
  for (let d = 1; d <= FIELD_RANGE && front.length > 0; d += 1) {
    const next = [];
    for (const i of front) {
      const x = i % width;
      const y = (i - x) / width;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (near[j] > d) { near[j] = d; next.push(j); }
        }
      }
    }
    front = next;
  }

  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
  const isField = (x, y) => {
    if (!inside(x, y)) return false;
    const d = near[y * width + x];
    return d >= FIELD_REACH && d <= FIELD_RANGE && state.tiles.terrain[y * width + x] === TERRAIN_GRASS;
  };

  /** A number for a block, or for the edge between two, mixed with the seed. */
  const keyOf = (bx, by) => (((by + 7) * 4099 + (bx + 7)) * 31 + seed) >>> 0;
  const roll = (key, salt) => jitter(key, salt);

  function blockOf(bx, by) {
    const key = keyOf(bx, by);
    return {
      kind: roll(key, 3) < CROP_SHARE ? "crop" : "meadow",
      stripe: roll(key, 5) < 0.5 ? 0 : 1,
      tone: Math.floor(roll(key, 7) * 3) % 3,
    };
  }

  /** What the edge between two neighbouring blocks is: a hedge, a track, or
   * open. The same answer from either side. */
  function edgeOf(ax, ay, bx, by) {
    const lo = keyOf(Math.min(ax, bx), Math.min(ay, by));
    const vertical = ax !== bx ? 1 : 2;
    const r = roll((lo * 3 + vertical) >>> 0, 11);
    if (r < TRACK_SHARE) return "track";
    return r < TRACK_SHARE + HEDGE_SHARE ? "hedge" : "open";
  }

  // Answers kept per tile: the street baker and the verges ask the ground's
  // colour per vertex, many times a tile, and a fresh object and array every
  // time slowed a chunk bake from 5 ms to 12 at p95 (S2).
  const memo = new Array(width * height);
  const NONE = 0;

  return {
    /** The field this tile is part of, or undefined: `{ kind, stripe, tone,
     * hedge: [n, e, s, w], track }`. */
    at(x, y) {
      if (!inside(x, y)) return undefined;
      const index = y * width + x;
      const kept = memo[index];
      if (kept !== undefined) return kept === NONE ? undefined : kept;
      const found = fieldAt(x, y);
      memo[index] = found ?? NONE;
      return found;
    },
  };

  function fieldAt(x, y) {
    {
      if (!isField(x, y)) return undefined;
      const bx = Math.floor(x / FIELD_BLOCK);
      const by = Math.floor(y / FIELD_BLOCK);
      const hedge = [false, false, false, false];
      let track = false;
      SIDES.forEach(([dx, dy], side) => {
        const nx = x + dx;
        const ny = y + dy;
        const nbx = Math.floor(nx / FIELD_BLOCK);
        const nby = Math.floor(ny / FIELD_BLOCK);
        if (nbx === bx && nby === by) return;
        if (!isField(nx, ny)) return;
        const edge = edgeOf(bx, by, nbx, nby);
        if (edge === "hedge") hedge[side] = true;
        else if (edge === "track") track = true;
      });
      return { ...blockOf(bx, by), hedge, track };
    }
  }
}

/** One countryside per model: the instanced pass and the estimate ask every
 * frame, and the flood behind it is a pass over the whole map. A new model
 * comes with every world change, so the cache can never answer for the old
 * town. */
const byModel = new WeakMap();
export function countrysideFor(state, model) {
  let country = byModel.get(model);
  if (!country) {
    country = createCountryside(state);
    byModel.set(model, country);
  }
  return country;
}

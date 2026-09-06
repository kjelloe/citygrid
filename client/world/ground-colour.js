// What colour the ground is (slice V3; specs/engine/05-ground-and-streets.md §5.1).
//
// The terrain mesh has been one flat colour per tile since the renderer was
// written, and that was a decision rather than an oversight: a city grid wants
// to read as tiles. At the zoom the reference shots use it also reads as a
// checkerboard of green patches, and it is the first thing the eye lands on.
//
// So the rule is not "blend everything". Blending the built land would take the
// grid away, and the grid is what makes a city legible. **Natural ground
// blends; anything a player has put there does not.** A corner shared by four
// untouched tiles takes their mean; a corner touching a road, a zone or a
// building keeps its own tile's colour, and the edge of the city stays crisp.
//
// Two cheap signals on top, both from Higashiyama's `groundColorAt`: a per-tile
// mottle so a field is not one flat sheet, and a distance-to-street tone so the
// country beyond the city reads as country. Neither touches built land.
//
// Pure and derived, like the rest of `client/world/` (ruling 032).

import { jitter } from "./hash.js";
import { getConfig } from "./config.js";
import { NET_PRESENT } from "../constants-mirror.js";
import { zoneTint } from "./params.js";

const r8 = (hex) => (hex >> 16) & 0xff;
const g8 = (hex) => (hex >> 8) & 0xff;
const b8 = (hex) => hex & 0xff;
const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const pack = (r, g, b) => (clamp8(r) << 16) | (clamp8(g) << 8) | clamp8(b);

/** Corners in the order `terrain.js` emits them: 0 = (x, y), 1 = (x+1, y),
 * 2 = (x, y+1), 3 = (x+1, y+1). The four tiles meeting at corner `c` of tile
 * `(x, y)` are the tile itself and its neighbours on that side. */
const CORNER = [[-1, -1], [0, -1], [-1, 0], [0, 0]];

/** Distance in tiles from every tile to the nearest road tile, flooded outward
 * and stopped after `rings` — beyond that the answer is "far" and the exact
 * number does not change any colour. */
function floodFromRoads(state, rings) {
  const { width, height } = state;
  const out = new Uint8Array(width * height).fill(255);
  let front = [];
  for (let i = 0; i < out.length; i += 1) {
    if ((state.tiles.road[i] & NET_PRESENT) !== 0) { out[i] = 0; front.push(i); }
  }
  for (let ring = 1; ring <= rings && front.length > 0; ring += 1) {
    const next = [];
    for (const i of front) {
      const x = i % width;
      const y = (i - x) / width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (out[j] !== 255) continue;
        out[j] = ring;
        next.push(j);
      }
    }
    front = next;
  }
  // Everything the flood never reached is as far as far goes.
  for (let i = 0; i < out.length; i += 1) if (out[i] === 255) out[i] = rings;
  return out;
}

export function createGroundColour(state, palette) {
  const cfg = getConfig();
  const { blend, mottle, urbanReach, farTone } = cfg.ground;
  const tileM = cfg.tileM;
  const { width, height } = state;
  // The palette is handed in. `world/` never imports `render/` — the model is
  // derived from state and must not depend on how anything is drawn, and
  // `test/render.test.js` already holds every style's table to being complete.
  const table = palette.terrain;

  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
  const clampX = (x) => (x < 0 ? 0 : x >= width ? width - 1 : x);
  const clampY = (y) => (y < 0 ? 0 : y >= height ? height - 1 : y);

  /** Has a player put anything here? Roads, zoning and buildings all make a
   * tile "built": it keeps its flat colour and its edges stay hard. */
  function built(index) {
    return (state.tiles.road[index] & NET_PRESENT) !== 0
      || state.tiles.zone[index] !== 0
      || state.tiles.buildingId[index] !== 0;
  }

  // One entry per tile, filled on first ask.
  const cache = new Int32Array(width * height).fill(-1);

  /** How far every tile is from the nearest street, in tiles, as a flood from
   * the road layer outward.
   *
   * `model.nearestCorridor` per tile is the obvious way and it measured 5.3 ms
   * of a 16.6 ms rebuild on a 128×128 — over the 15 ms this slice is allowed.
   * It is also more precision than the answer needs: `urbanReach` is 40 m and a
   * tile is 20, so the whole falloff is two tiles wide and the colour it feeds
   * is per tile anyway. A flood over the grid is exact at that granularity and
   * costs one pass over the map.
   */
  const rings = Math.max(1, Math.ceil(urbanReach / tileM));
  const distance = farTone > 0 ? floodFromRoads(state, rings) : undefined;

  /** 0 on a street, 1 beyond `urbanReach`. */
  function remoteness(x, y) {
    if (!distance) return 0;
    return Math.min(1, (distance[y * width + x] * tileM) / urbanReach);
  }

  function computeTile(x, y) {
    const index = y * width + x;
    if (built(index)) {
      // Flat, and deliberately so: the grid is the thing being protected.
      if ((state.tiles.road[index] & NET_PRESENT) !== 0) return palette.road;
      // A ZONE IS A COLOUR OF THE GROUND TOO (slice V4), for the same reason a
      // road is (N30). It was a quad at the tile's height, and with relief that
      // quad either sinks into a hillside or hovers over it — at the steepest
      // slope on a `hilly` map it floated a visible sheet above the grass.
      // Painted into the mesh it follows the ground exactly, costs nothing, and
      // stops at the tile edge like every other built thing.
      //
      // Only where nothing has developed: an empty plot has to say "this is
      // zoned", a built one is already saying it with a building.
      const zone = state.tiles.zone[index];
      if (zone !== 0 && state.tiles.buildingId[index] === 0) return zoneTint(zone, palette);
      return table[state.tiles.terrain[index]] ?? 0xff00ff;
    }
    const base = table[state.tiles.terrain[index]] ?? 0xff00ff;
    let r = r8(base);
    let g = g8(base);
    let b = b8(base);

    // A field is not one flat sheet. ±`mottle` of lightness, from the tile.
    if (mottle > 0) {
      const lift = 1 + (jitter(index, 5) - 0.5) * 2 * mottle;
      r *= lift; g *= lift; b *= lift;
    }

    // Country beyond the city: darker, and greyer. Desaturating as well as
    // darkening is what stops it reading as "a different terrain type".
    if (farTone > 0) {
      const far = remoteness(x, y) * farTone;
      const grey = (r + g + b) / 3;
      r = (r * (1 - far) + grey * far) * (1 - far * 0.5);
      g = (g * (1 - far) + grey * far) * (1 - far * 0.5);
      b = (b * (1 - far) + grey * far) * (1 - far * 0.5);
    }
    return pack(r, g, b);
  }

  /** One tile's own colour. */
  function tile(x, y) {
    const index = clampY(y) * width + clampX(x);
    if (cache[index] >= 0) return cache[index];
    const value = computeTile(clampX(x), clampY(y));
    cache[index] = value;
    return value;
  }

  /** The colour of one corner of one tile.
   *
   * The mean of the four tiles meeting there when all four are natural, and the
   * tile's own colour the moment one of them is not — so a road, a zone or a
   * building has a hard edge and a meadow does not. */
  function corner(x, y, c) {
    const own = tile(x, y);
    if (blend <= 0) return own;
    const [dx, dy] = CORNER[c];
    let r = 0;
    let g = 0;
    let b = 0;
    for (let j = 0; j <= 1; j += 1) {
      for (let i = 0; i <= 1; i += 1) {
        const nx = x + dx + i;
        const ny = y + dy + j;
        if (inside(nx, ny) && built(ny * width + nx)) return own;
        const hex = tile(nx, ny);
        r += r8(hex); g += g8(hex); b += b8(hex);
      }
    }
    const mixed = pack(r / 4, g / 4, b / 4);
    if (blend >= 1) return mixed;
    return pack(
      r8(own) + (r8(mixed) - r8(own)) * blend,
      g8(own) + (g8(mixed) - g8(own)) * blend,
      b8(own) + (b8(mixed) - b8(own)) * blend,
    );
  }

  return { tile, corner };
}

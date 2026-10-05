// Seeded terrain generation. Integer-only, so the same seed produces the same
// region on every machine and in any language a twin is written in.
//
// Noise is hashed from coordinates rather than drawn from the rng stream, so
// adding a feature later cannot shift the sequence every other subsystem sees.

import { mix32, makeRng, nextInt, nextRange, chance, streamSeed } from "../shared/prng.js";
import { idiv, fdiv, clamp, FP, lerp } from "../shared/idiv.js";
import { i32 } from "../shared/arrays.js";
import { tileAt, inBounds, DIR4, DIR8, neighbour } from "../shared/grid.js";
import {
  TERRAIN_GRASS, TERRAIN_DIRT, TERRAIN_FOREST, TERRAIN_WATER, TERRAIN_SHALLOW,
  TERRAIN_ROCK, TERRAIN_SAND, TERRAIN_MARSH, TERRAIN_STYLE_FLAT, TERRAIN_STYLE_ROLLING,
  TERRAIN_STYLE_HILLY, WATER_NONE, WATER_LAKES, WATER_RIVER, WATER_COASTAL,
  WATER_ARCHIPELAGO,
} from "./constants.js";

/** Deterministic 2D value hash: 0..255 from a seed and a lattice point. */
function hash2(seed, x, y) {
  var h = mix32((seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)) >>> 0);
  return h >>> 24;
}

/** Integer smoothstep on a fixed-point t in [0, FP]. */
function smooth(t) {
  return idiv(Math.imul(Math.imul(t, t), 3 * FP - 2 * t), FP * FP);
}

/** One octave of value noise sampled at (x, y) with the given cell size. */
function octave(seed, x, y, cell) {
  var gx = fdiv(x, cell);
  var gy = fdiv(y, cell);
  var fx = idiv((x - gx * cell) * FP, cell);
  var fy = idiv((y - gy * cell) * FP, cell);
  var sx = smooth(fx);
  var sy = smooth(fy);
  var a = hash2(seed, gx, gy);
  var b = hash2(seed, gx + 1, gy);
  var c = hash2(seed, gx, gy + 1);
  var d = hash2(seed, gx + 1, gy + 1);
  var top = lerp(a, b, sx);
  var bottom = lerp(c, d, sx);
  return lerp(top, bottom, sy);
}

var STYLE_OCTAVES = {};
STYLE_OCTAVES[TERRAIN_STYLE_FLAT] = [{ cell: 48, weight: 6 }, { cell: 16, weight: 1 }];
STYLE_OCTAVES[TERRAIN_STYLE_ROLLING] = [{ cell: 32, weight: 5 }, { cell: 14, weight: 3 }, { cell: 6, weight: 1 }];
STYLE_OCTAVES[TERRAIN_STYLE_HILLY] = [{ cell: 24, weight: 4 }, { cell: 10, weight: 4 }, { cell: 5, weight: 2 }];

var STYLE_RELIEF = {};
// How much of the 0..255 range the elevation actually spans. Flat land is not
// featureless — it is gently varied, which reads better and still lets water
// find a course.
STYLE_RELIEF[TERRAIN_STYLE_FLAT] = 60;
STYLE_RELIEF[TERRAIN_STYLE_ROLLING] = 140;
STYLE_RELIEF[TERRAIN_STYLE_HILLY] = 255;

export function generateElevation(state, seed) {
  var style = state.options.terrainStyle;
  var octaves = STYLE_OCTAVES[style] ? STYLE_OCTAVES[style] : STYLE_OCTAVES[TERRAIN_STYLE_ROLLING];
  var relief = STYLE_RELIEF[style] ? STYLE_RELIEF[style] : 140;
  var total = 0;
  var i;
  for (i = 0; i < octaves.length; i += 1) total += octaves[i].weight;

  var elevation = state.tiles.elevation;
  for (var y = 0; y < state.height; y += 1) {
    for (var x = 0; x < state.width; x += 1) {
      var sum = 0;
      for (i = 0; i < octaves.length; i += 1) {
        sum += octave(seed + i * 7919, x, y, octaves[i].cell) * octaves[i].weight;
      }
      var value = idiv(sum, total);
      elevation[tileAt(state.width, x, y)] = clamp(idiv(value * relief, 255), 0, 255);
    }
  }
}

function setWater(state, index) {
  state.tiles.terrain[index] = TERRAIN_WATER;
}

/** Carves a river from one edge to another, following downhill where it can.
 * The walk is biased toward the target rather than pathfound: a river that
 * takes the optimal route looks like a canal. */
function carveRiver(state, rng) {
  var width = state.width;
  var height = state.height;
  var horizontal = chance(rng, 2);
  var x = horizontal ? 0 : nextInt(rng, width);
  var y = horizontal ? nextInt(rng, height) : 0;
  var targetX = horizontal ? width - 1 : nextInt(rng, width);
  var targetY = horizontal ? nextInt(rng, height) : height - 1;

  var steps = (width + height) * 3;
  var radius = 1 + nextInt(rng, 2);
  for (var step = 0; step < steps; step += 1) {
    stamp(state, x, y, radius, setWater);
    if (x === targetX && y === targetY) break;

    // Choose among the neighbours that move us toward the target, preferring
    // the lowest ground — water finds the valley.
    var bestIndex = -1;
    var bestScore = 1 << 30;
    for (var d = 0; d < DIR4.length; d += 1) {
      var nx = x + DIR4[d].dx;
      var ny = y + DIR4[d].dy;
      if (!inBounds(width, height, nx, ny)) continue;
      var toward = Math.abs(nx - targetX) + Math.abs(ny - targetY);
      var elevation = state.tiles.elevation[tileAt(width, nx, ny)];
      var score = toward * 4 + idiv(elevation, 8) + nextInt(rng, 6);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = d;
      }
    }
    if (bestIndex < 0) break;
    x += DIR4[bestIndex].dx;
    y += DIR4[bestIndex].dy;
    if (chance(rng, 24)) radius = clamp(radius + (chance(rng, 2) ? 1 : -1), 1, 3);
  }
}

function stamp(state, cx, cy, radius, paint) {
  for (var dy = -radius; dy <= radius; dy += 1) {
    for (var dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy > radius * radius + 1) continue;
      var x = cx + dx;
      var y = cy + dy;
      if (!inBounds(state.width, state.height, x, y)) continue;
      paint(state, tileAt(state.width, x, y));
    }
  }
}

function carveLakes(state, rng) {
  var count = 2 + nextInt(rng, 4);
  for (var i = 0; i < count; i += 1) {
    // Lakes sit in low ground: sample a few candidates and take the lowest.
    var bestX = 0;
    var bestY = 0;
    var bestElevation = 256;
    for (var attempt = 0; attempt < 8; attempt += 1) {
      var x = nextRange(rng, 3, state.width - 4);
      var y = nextRange(rng, 3, state.height - 4);
      var elevation = state.tiles.elevation[tileAt(state.width, x, y)];
      if (elevation < bestElevation) {
        bestElevation = elevation;
        bestX = x;
        bestY = y;
      }
    }
    var radius = 2 + nextInt(rng, 4);
    stamp(state, bestX, bestY, radius, setWater);
    // A few satellite ponds so the shape is not a circle.
    var lobes = nextInt(rng, 3);
    for (var k = 0; k < lobes; k += 1) {
      stamp(state, bestX + nextRange(rng, -radius, radius), bestY + nextRange(rng, -radius, radius),
        1 + nextInt(rng, 2), setWater);
    }
  }
}

/** Floods everything below a sea level, from one edge inward. */
function floodCoast(state, level) {
  var terrain = state.tiles.terrain;
  var elevation = state.tiles.elevation;
  for (var i = 0; i < terrain.length; i += 1) {
    if (elevation[i] < level) terrain[i] = TERRAIN_WATER;
  }
}

/** Tilts elevation toward one edge so that a coast has a direction. */
function tiltToward(state, edge) {
  var elevation = state.tiles.elevation;
  var width = state.width;
  var height = state.height;
  for (var y = 0; y < height; y += 1) {
    for (var x = 0; x < width; x += 1) {
      var along = edge === 0 ? y : edge === 1 ? width - 1 - x : edge === 2 ? height - 1 - y : x;
      var span = (edge === 0 || edge === 2) ? height : width;
      var ramp = idiv(along * 200, span);
      var index = tileAt(width, x, y);
      elevation[index] = clamp(idiv(elevation[index] + ramp, 2), 0, 255);
    }
  }
}

export function generateWater(state, rng) {
  var style = state.options.waterStyle;
  if (style === WATER_NONE) return;
  if (style === WATER_RIVER) {
    carveRiver(state, rng);
    if (chance(rng, 3)) carveRiver(state, rng);
    return;
  }
  if (style === WATER_LAKES) {
    carveLakes(state, rng);
    return;
  }
  if (style === WATER_COASTAL) {
    tiltToward(state, nextInt(rng, 4));
    floodCoast(state, 70);
    if (chance(rng, 2)) carveRiver(state, rng);
    return;
  }
  if (style === WATER_ARCHIPELAGO) {
    // 120 drowned so much land that a quarter of archipelago regions had
    // nowhere to build and were rejected before fairness was even considered.
    floodCoast(state, 78);
    return;
  }
}

/** Shallow water rings deep water; sand rings the shallows. Both are cosmetic
 * on the simulation side but load-bearing for readability. */
export function shoreline(state) {
  var terrain = state.tiles.terrain;
  var width = state.width;
  var height = state.height;
  var shallow = [];
  var i;
  var x;
  var y;
  for (y = 0; y < height; y += 1) {
    for (x = 0; x < width; x += 1) {
      var index = tileAt(width, x, y);
      if (terrain[index] !== TERRAIN_WATER) continue;
      var touchesLand = false;
      for (var d = 0; d < DIR8.length; d += 1) {
        var n = neighbour(width, height, x, y, DIR8[d]);
        if (n >= 0 && terrain[n] !== TERRAIN_WATER) touchesLand = true;
      }
      if (touchesLand) shallow.push(index);
    }
  }
  for (i = 0; i < shallow.length; i += 1) terrain[shallow[i]] = TERRAIN_SHALLOW;

  var sand = [];
  for (y = 0; y < height; y += 1) {
    for (x = 0; x < width; x += 1) {
      var land = tileAt(width, x, y);
      if (terrain[land] !== TERRAIN_GRASS) continue;
      for (var k = 0; k < DIR8.length; k += 1) {
        var w = neighbour(width, height, x, y, DIR8[k]);
        if (w >= 0 && (terrain[w] === TERRAIN_SHALLOW || terrain[w] === TERRAIN_WATER)) {
          sand.push(land);
          break;
        }
      }
    }
  }
  for (i = 0; i < sand.length; i += 1) terrain[sand[i]] = TERRAIN_SAND;
}

/** High ground becomes rock: unbuildable, and a natural district border.
 *
 * Lower on a HILLY map since T2 (A79). At one threshold for every style a
 * hilly region had almost no rock in it — the peaks are higher but the field
 * is normalised, so the same 215 caught the same share of a flatter map. A
 * hilly map is supposed to be the one you have to build around. */
export function rockyPeaks(state) {
  var terrain = state.tiles.terrain;
  var elevation = state.tiles.elevation;
  var limit = state.options.terrainStyle === TERRAIN_STYLE_HILLY ? ROCK_ABOVE_HILLY : ROCK_ABOVE;
  for (var i = 0; i < terrain.length; i += 1) {
    if (terrain[i] === TERRAIN_GRASS && elevation[i] > limit) terrain[i] = TERRAIN_ROCK;
  }
}

/** How high ground has to be before it is bare rock, and how high on a hilly
 * map. Elevation is a normalised byte, so these are shares of the range
 * rather than metres. */
var ROCK_ABOVE = 215;
var ROCK_ABOVE_HILLY = 186;

/** How many shallow tiles a 5x5 box around a bank tile needs before the land
 * there is marsh rather than beach. A one-tile shelf — most of a river's bank
 * — puts about five in the box; the flats where the shelf spreads put a dozen
 * or more. */
var MARSH_SHELF = 8;

/**
 * Marsh where the shallow shelf is widest (T2, A79).
 *
 * Reeds and standing water rather than a beach, and UNBUILDABLE — which is the
 * point: a river mouth should cost a player something to build across. Run
 * after `shoreline`, so the sand ring exists to be converted.
 *
 * By the WIDTH of the shelf rather than by noise, so the band is where the
 * land is actually flat and wet, and so two maps from one seed differ only
 * where their water does.
 */
export function marshBand(state) {
  var terrain = state.tiles.terrain;
  var width = state.width;
  var height = state.height;
  var found = [];
  var x;
  var y;
  var i;
  for (y = 0; y < height; y += 1) {
    for (x = 0; x < width; x += 1) {
      var index = tileAt(width, x, y);
      if (terrain[index] !== TERRAIN_SAND) continue;
      var shallow = 0;
      for (var dy = -2; dy <= 2; dy += 1) {
        for (var dx = -2; dx <= 2; dx += 1) {
          var nx = x + dx;
          var ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (terrain[tileAt(width, nx, ny)] === TERRAIN_SHALLOW) shallow += 1;
        }
      }
      if (shallow >= MARSH_SHELF) found.push(index);
    }
  }
  for (i = 0; i < found.length; i += 1) terrain[found[i]] = TERRAIN_MARSH;
}

/** Forest by random walk, as in the reference: clumps rather than noise, so
 * the map has thickets and clearings instead of an even scatter. */
export function plantForest(state, rng, density) {
  if (density <= 0) return;
  var terrain = state.tiles.terrain;
  var area = state.width * state.height;
  var walks = idiv(area * density, 2000);
  for (var w = 0; w < walks; w += 1) {
    var x = nextInt(rng, state.width);
    var y = nextInt(rng, state.height);
    var length = 20 + nextInt(rng, 60);
    for (var step = 0; step < length; step += 1) {
      if (!inBounds(state.width, state.height, x, y)) break;
      var index = tileAt(state.width, x, y);
      if (terrain[index] === TERRAIN_GRASS) terrain[index] = TERRAIN_FOREST;
      var dir = DIR8[nextInt(rng, DIR8.length)];
      x += dir.dx;
      y += dir.dy;
    }
  }
}

export function isBuildable(terrain) {
  return terrain === TERRAIN_GRASS || terrain === TERRAIN_FOREST
    || terrain === TERRAIN_DIRT || terrain === TERRAIN_SAND;
}

/**
 * The water bodies of a region (T4, A67): one entry per connected run of water
 * tiles, with its size and whether it reaches the edge of the region.
 *
 * `edge` is a boolean and `edgeTiles` the count behind it. A body either leads
 * out of the region or it does not — that is the whole question a sea gate
 * asks, and "how many of its tiles are on a border" is not the same thing.
 *
 * Derived on every ask and never stored, like T2's `railReach` — a body that
 * is dug out or filled in is a different body the same month, with no record
 * to keep in step and nothing to migrate.
 *
 * `isWater` is deep AND shallow, so a lake is one body rather than a ring of
 * ponds around its own shelf.
 */
export function waterBodies(state) {
  var width = state.width;
  var height = state.height;
  var terrain = state.tiles.terrain;
  var total = terrain.length;
  var label = i32(total);
  var bodies = [];
  var queue = i32(total);
  var i;
  for (i = 0; i < total; i += 1) label[i] = -1;

  for (i = 0; i < total; i += 1) {
    if (label[i] >= 0 || !isWater(terrain[i])) continue;
    var id = bodies.length;
    var size = 0;
    var edgeTiles = 0;
    var count = 0;
    label[i] = id;
    queue[count] = i;
    count += 1;
    var head = 0;
    while (head < count) {
      var index = queue[head];
      head += 1;
      size += 1;
      var x = index % width;
      var y = idiv(index - x, width);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edgeTiles += 1;
      for (var d = 0; d < DIR4.length; d += 1) {
        var n = neighbour(width, height, x, y, DIR4[d]);
        if (n < 0 || label[n] >= 0 || !isWater(terrain[n])) continue;
        label[n] = id;
        queue[count] = n;
        count += 1;
      }
    }
    bodies.push({ id: id, size: size, edge: edgeTiles > 0, edgeTiles: edgeTiles, label: label });
  }
  return bodies;
}

/**
 * The body a footprint's RING touches, or `undefined` for one inland.
 *
 * A building on the water stands on the shore, never in it — the placement
 * rules refuse water under a footprint — so "on a lake" means "with a lake
 * beside it", and the ring is the same one `touchesRail` and `touchesCarrier`
 * walk. Where two bodies meet a corner, the bigger one wins: a marina wants
 * the water it can sail on.
 */
export function bodyAt(state, bodies, x, y, w, h) {
  if (bodies.length === 0) return undefined;
  var label = bodies[0].label;
  var width = state.width;
  var wide = w ? w : 1;
  var tall = h ? h : 1;
  var best;
  for (var dy = -1; dy <= tall; dy += 1) {
    for (var dx = -1; dx <= wide; dx += 1) {
      var nx = x + dx;
      var ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= state.height) continue;
      var id = label[tileAt(width, nx, ny)];
      if (id < 0) continue;
      var body = bodies[id];
      if (!best || body.size > best.size) best = body;
    }
  }
  return best;
}

export function isWater(terrain) {
  return terrain === TERRAIN_WATER || terrain === TERRAIN_SHALLOW;
}

/** The whole pipeline. Each stage draws from its own stream so that changing
 * one does not reshuffle the others. */
export function generateTerrain(state) {
  var seed = state.options.seed;
  generateElevation(state, streamSeed(seed, "elevation"));
  generateWater(state, makeRng(streamSeed(seed, "water")));
  rockyPeaks(state);
  shoreline(state);
  marshBand(state);
  plantForest(state, makeRng(streamSeed(seed, "forest")), state.options.treeDensity);
  return state;
}

/** Counts, for the fairness gate and the region name. */
export function surveyTerrain(state) {
  var terrain = state.tiles.terrain;
  var survey = { buildable: 0, water: 0, forest: 0, rock: 0, sand: 0, total: terrain.length };
  for (var i = 0; i < terrain.length; i += 1) {
    if (isBuildable(terrain[i])) survey.buildable += 1;
    if (isWater(terrain[i])) survey.water += 1;
    if (terrain[i] === TERRAIN_FOREST) survey.forest += 1;
    if (terrain[i] === TERRAIN_ROCK) survey.rock += 1;
    if (terrain[i] === TERRAIN_SAND) survey.sand += 1;
  }
  return survey;
}

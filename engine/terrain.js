// Seeded terrain generation. Integer-only, so the same seed produces the same
// region on every machine and in any language a twin is written in.
//
// Noise is hashed from coordinates rather than drawn from the rng stream, so
// adding a feature later cannot shift the sequence every other subsystem sees.

import { mix32, makeRng, nextInt, nextRange, chance, streamSeed } from "../shared/prng.js";
import { idiv, fdiv, clamp, FP, lerp } from "../shared/idiv.js";
import { tileAt, xOf, yOf, inBounds, DIR4, DIR8, neighbour } from "../shared/grid.js";
import {
  TERRAIN_GRASS, TERRAIN_DIRT, TERRAIN_FOREST, TERRAIN_WATER, TERRAIN_SHALLOW,
  TERRAIN_ROCK, TERRAIN_SAND, TERRAIN_STYLE_FLAT, TERRAIN_STYLE_ROLLING,
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

/** High ground becomes rock: unbuildable, and a natural district border. */
export function rockyPeaks(state) {
  var terrain = state.tiles.terrain;
  var elevation = state.tiles.elevation;
  for (var i = 0; i < terrain.length; i += 1) {
    if (terrain[i] === TERRAIN_GRASS && elevation[i] > 215) terrain[i] = TERRAIN_ROCK;
  }
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

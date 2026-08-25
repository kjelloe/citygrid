// District partition and its fairness gate.
//
// Borders follow terrain — rivers, ridges and coastlines — so a district looks
// like a place rather than a rectangle. A region that cannot be divided fairly
// is regenerated rather than shipped: the mirror-fairness lesson from a
// sibling project, applied to N players instead of two.

import { makeRng, nextInt, streamSeed } from "../shared/prng.js";
import { idiv, clamp } from "../shared/idiv.js";
import { tileAt, xOf, yOf, DIR4, neighbour } from "../shared/grid.js";
import { isBuildable, isWater } from "./terrain.js";
import { TERRAIN_ROCK } from "./constants.js";

/** Crossing a river or a ridge costs more than walking across a field, so a
 * grown district stops at the water's edge on its own. */
function crossingCost(state, index) {
  var terrain = state.tiles.terrain[index];
  if (isWater(terrain)) return 40;
  if (terrain === TERRAIN_ROCK) return 25;
  var elevation = state.tiles.elevation[index];
  return 1 + idiv(elevation, 48);
}

/** Capacity-constrained region growing.
 *
 * The first implementation grew each district by cheapest-distance alone and
 * was rejected by its own fairness gate on 81% of regions: when a river cuts
 * the map, whoever starts on the larger side simply gets more, and no
 * threshold fixes that. So growth is quota-driven instead — every district
 * expands until it holds its share of the BUILDABLE land, and only then gives
 * way. Cost still shapes the border, so it still follows the terrain; quota
 * decides how far it runs.
 *
 * Districts take turns, cheapest frontier tile first, which keeps the result
 * deterministic without needing a tie-break rule. */
export function partition(state, count) {
  var width = state.width;
  var height = state.height;
  var total = width * height;
  var district = state.tiles.district;
  var terrain = state.tiles.terrain;
  var rng = makeRng(streamSeed(state.options.seed, "districts"));

  var seeds = chooseSeeds(state, count, rng);
  if (seeds.length === 0) return { seeds: [], ok: false };

  var i;
  var buildableTotal = 0;
  for (i = 0; i < total; i += 1) {
    district[i] = 0;
    if (isBuildable(terrain[i])) buildableTotal += 1;
  }
  var quota = idiv(buildableTotal, count);

  // One bucket queue per district. Costs are small integers, so buckets beat a
  // heap and keep insertion order stable.
  var queues = [];
  var heads = [];
  var held = [];
  for (i = 0; i < count; i += 1) {
    queues.push([]);
    heads.push(0);
    held.push(0);
  }

  var owner = [];
  for (i = 0; i < total; i += 1) owner.push(0);

  function push(which, index, cost) {
    var queue = queues[which];
    if (!queue[cost]) queue[cost] = [];
    queue[cost].push(index);
  }

  // The seed is pushed, not claimed. Claiming it here would make step() skip
  // it as already-owned and never expand its neighbours — which left every
  // district exactly one tile wide.
  for (i = 0; i < seeds.length; i += 1) push(i, seeds[i], 0);

  /** Takes the cheapest unclaimed tile from one district's frontier. Returns
   * false when that district has nothing left to reach. */
  function step(which) {
    var queue = queues[which];
    for (var cost = heads[which]; cost < queue.length + 64; cost += 1) {
      var bucket = queue[cost];
      if (!bucket || bucket.length === 0) continue;
      while (bucket.length > 0) {
        var index = bucket.shift();
        if (owner[index] !== 0) continue;
        owner[index] = which + 1;
        district[index] = which + 1;
        if (isBuildable(terrain[index])) held[which] += 1;
        var x = xOf(width, index);
        var y = yOf(width, index);
        for (var d = 0; d < DIR4.length; d += 1) {
          var n = neighbour(width, height, x, y, DIR4[d]);
          if (n < 0 || owner[n] !== 0) continue;
          push(which, n, cost + crossingCost(state, n));
        }
        heads[which] = cost;
        return true;
      }
    }
    return false;
  }

  // Round one: everyone grows until they hold their quota.
  var hungry = true;
  while (hungry) {
    hungry = false;
    for (i = 0; i < count; i += 1) {
      if (held[i] >= quota) continue;
      if (step(i)) hungry = true;
    }
  }
  // Round two: whatever is left over — water, rock, awkward corners — goes to
  // whichever district can still reach it, so the map has no unowned holes.
  var leftovers = true;
  while (leftovers) {
    leftovers = false;
    for (i = 0; i < count; i += 1) {
      if (step(i)) leftovers = true;
    }
  }

  return { seeds: seeds, ok: true, quota: quota };
}

/** Seed points spread apart on buildable land, biased away from each other so
 * that no district starts inside another's natural basin. */
function chooseSeeds(state, count, rng) {
  var width = state.width;
  var height = state.height;
  var candidates = [];
  for (var i = 0; i < width * height; i += 1) {
    if (isBuildable(state.tiles.terrain[i])) candidates.push(i);
  }
  if (candidates.length < count * 4) return [];

  var seeds = [];
  for (var s = 0; s < count; s += 1) {
    var bestIndex = -1;
    var bestScore = -1;
    // Farthest-point sampling. Best-of-16 was not spread enough at eight
    // seats — seeds landed in the same basin and the quota had to drag the
    // border across the whole map to compensate.
    for (var attempt = 0; attempt < 64; attempt += 1) {
      var candidate = candidates[nextInt(rng, candidates.length)];
      var score = 1 << 20;
      for (var k = 0; k < seeds.length; k += 1) {
        var dx = xOf(width, candidate) - xOf(width, seeds[k]);
        var dy = yOf(width, candidate) - yOf(width, seeds[k]);
        var distance = dx * dx + dy * dy;
        if (distance < score) score = distance;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIndex = candidate;
      }
    }
    // Two districts sharing a seed would leave one of them with nothing, so a
    // duplicate is dropped rather than kept.
    var duplicate = false;
    for (var q = 0; q < seeds.length; q += 1) {
      if (seeds[q] === bestIndex) duplicate = true;
    }
    if (duplicate || bestIndex < 0) return [];
    seeds.push(bestIndex);
  }
  return seeds;
}

/** What the fairness gate measures. */
export function surveyDistricts(state, count) {
  var district = state.tiles.district;
  var terrain = state.tiles.terrain;
  var width = state.width;
  var height = state.height;

  var stats = [];
  var i;
  for (i = 0; i < count; i += 1) {
    stats.push({ district: i + 1, tiles: 0, buildable: 0, water: 0, neighbours: [] });
  }

  for (i = 0; i < district.length; i += 1) {
    var id = district[i];
    if (id === 0 || id > count) continue;
    var stat = stats[id - 1];
    stat.tiles += 1;
    if (isBuildable(terrain[i])) stat.buildable += 1;
    if (isWater(terrain[i])) stat.water += 1;
  }

  // Adjacency: which districts touch, so that connectivity can be required.
  for (var y = 0; y < height; y += 1) {
    for (var x = 0; x < width; x += 1) {
      var index = tileAt(width, x, y);
      var mine = district[index];
      if (mine === 0 || mine > count) continue;
      for (var d = 0; d < DIR4.length; d += 1) {
        var n = neighbour(width, height, x, y, DIR4[d]);
        if (n < 0) continue;
        var theirs = district[n];
        if (theirs === 0 || theirs === mine || theirs > count) continue;
        var list = stats[mine - 1].neighbours;
        var seen = false;
        for (var k = 0; k < list.length; k += 1) {
          if (list[k] === theirs) seen = true;
        }
        if (!seen) list.push(theirs);
      }
    }
  }
  return stats;
}

/** The gate itself. A region that fails is regenerated, not shipped.
 *
 * `spread` is the ratio of the smallest district's buildable area to the
 * largest, in percent. 100 is perfectly equal. */
export function fairness(stats, requireWater) {
  if (stats.length === 0) return { ok: false, reason: "no districts", spread: 0 };
  var smallest = 1 << 28;
  var largest = 0;
  var isolated = [];
  var dry = [];
  for (var i = 0; i < stats.length; i += 1) {
    var stat = stats[i];
    if (stat.buildable < smallest) smallest = stat.buildable;
    if (stat.buildable > largest) largest = stat.buildable;
    if (stat.neighbours.length < 1) isolated.push(stat.district);
    if (stat.water === 0) dry.push(stat.district);
  }
  var spread = largest === 0 ? 0 : idiv(smallest * 100, largest);
  var verdict = {
    ok: true, spread: spread, smallest: smallest, largest: largest,
    isolated: isolated, dry: dry, withWater: stats.length - dry.length, reason: "",
  };

  // Era-0 thresholds. The sweep in slice 6.1 replaces them with measured ones.
  if (smallest < 40) {
    verdict.ok = false;
    verdict.reason = "a district has too little buildable land";
  } else if (spread < 45) {
    verdict.ok = false;
    verdict.reason = "districts are too unequal";
  } else if (isolated.length > 0 && stats.length > 1) {
    // Meaningless with a single district, which is the singleplayer case.
    verdict.ok = false;
    verdict.reason = "a district touches no other";
  } else if (dry.length > 0 && requireWater === true) {
    // Surface water is an ADVANTAGE, not a requirement: groundwater pumps work
    // anywhere (gamedesign 7.5), so an inland district is viable, merely
    // cheaper to supply if it has a lake.
    //
    // This began as a hard gate and rejected 116 of 200 regions — with one
    // river and eight districts, most districts simply cannot touch water, and
    // the gate was refusing perfectly playable maps. It is now a reported
    // metric, and only scenario generation that specifically needs waterfront
    // for every seat passes requireWater.
    verdict.ok = false;
    verdict.reason = "a district has no water access";
  }
  return verdict;
}

export function assignDistricts(state, count, requireWater) {
  var result = partition(state, count);
  if (!result.ok) return { ok: false, reason: "could not place district seeds", stats: [], spread: 0 };
  var stats = surveyDistricts(state, count);
  var verdict = fairness(stats, requireWater);
  verdict.stats = stats;
  verdict.seeds = result.seeds;
  return verdict;
}

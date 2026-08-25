// Region identity. A seed should produce a recognisable strategic situation
// with a name, not just terrain: "the delta with three islands" is something
// two people can talk about, "seed 41823" is not.
//
// The name is derived from what generation actually produced, so it cannot
// promise an archipelago and deliver a field. Localised at display time — the
// engine stores the parts, never the sentence.

import { idiv } from "../shared/idiv.js";
import { isWater, isBuildable } from "./terrain.js";
import { TERRAIN_FOREST, TERRAIN_ROCK, TERRAIN_SAND } from "./constants.js";
import { tileAt, DIR4, neighbour } from "../shared/grid.js";

/** Counts separate landmasses, so "islands" is a fact rather than a hope. */
export function countIslands(state) {
  var width = state.width;
  var height = state.height;
  var terrain = state.tiles.terrain;
  var seen = [];
  var i;
  for (i = 0; i < terrain.length; i += 1) seen.push(false);

  var islands = [];
  for (i = 0; i < terrain.length; i += 1) {
    if (seen[i] || isWater(terrain[i])) continue;
    var size = 0;
    var stack = [i];
    seen[i] = true;
    while (stack.length > 0) {
      var index = stack.pop();
      size += 1;
      var x = index % width;
      var y = idiv(index - x, width);
      for (var d = 0; d < DIR4.length; d += 1) {
        var n = neighbour(width, height, x, y, DIR4[d]);
        if (n < 0 || seen[n] || isWater(terrain[n])) continue;
        seen[n] = true;
        stack.push(n);
      }
    }
    // Ignore specks; a four-tile rock is not an island anyone will name.
    if (size >= 12) islands.push(size);
  }
  islands.sort(function bigger(a, b) { return b - a; });
  return islands;
}

/** The descriptive parts of a region's identity. The client turns these into a
 * localised phrase; the engine never stores prose. */
export function describeRegion(state) {
  var terrain = state.tiles.terrain;
  var total = terrain.length;
  var water = 0;
  var forest = 0;
  var rock = 0;
  var sand = 0;
  var buildable = 0;
  var relief = 0;
  var lowest = 255;
  var highest = 0;

  for (var i = 0; i < total; i += 1) {
    if (isWater(terrain[i])) water += 1;
    if (terrain[i] === TERRAIN_FOREST) forest += 1;
    if (terrain[i] === TERRAIN_ROCK) rock += 1;
    if (terrain[i] === TERRAIN_SAND) sand += 1;
    if (isBuildable(terrain[i])) buildable += 1;
    var elevation = state.tiles.elevation[i];
    if (elevation < lowest) lowest = elevation;
    if (elevation > highest) highest = elevation;
  }
  relief = highest - lowest;

  var islands = countIslands(state);
  var waterPercent = idiv(water * 100, total);
  var forestPercent = idiv(forest * 100, total);
  var rockPercent = idiv(rock * 100, total);

  var shape = "plain";
  if (islands.length >= 4) shape = "archipelago";
  else if (islands.length >= 2) shape = "islands";
  else if (waterPercent >= 30) shape = "coast";
  else if (waterPercent >= 8) shape = "valley";

  var relief_word = relief > 190 ? "mountainous" : relief > 110 ? "rolling" : "level";

  var feature = "open";
  if (forestPercent >= 30) feature = "wooded";
  else if (rockPercent >= 12) feature = "rocky";
  else if (sand > idiv(total, 20)) feature = "sandy";
  else if (waterPercent >= 20) feature = "watered";

  return {
    shape: shape,
    relief: relief_word,
    feature: feature,
    islands: islands.length,
    waterPercent: waterPercent,
    forestPercent: forestPercent,
    rockPercent: rockPercent,
    buildablePercent: idiv(buildable * 100, total),
  };
}

/** A stable key the client localises. Deliberately a key, not a sentence. */
export function regionNameKey(description) {
  return "region." + description.shape + "." + description.feature;
}

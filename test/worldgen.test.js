// Terrain, districts and the fairness gate.
//
// The gate is the point of this slice: a region that cannot be divided fairly
// between players is regenerated rather than shipped. Sweep-scale evidence
// lives in tools/mapsweep.mjs; these are the properties that must hold for
// every single region.

import test from "node:test";
import assert from "node:assert/strict";
import { createState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { generateTerrain, surveyTerrain, isBuildable, isWater } from "../engine/terrain.js";
import { assignDistricts, fairness, surveyDistricts } from "../engine/districts.js";
import { generateWorld } from "../engine/worldgen.js";
import { describeRegion, countIslands, regionNameKey } from "../engine/region-name.js";
import { assertHashable } from "../shared/canonical.js";
import { TERRAIN_WATER, TERRAIN_SHALLOW, TERRAIN_MARSH } from "../engine/constants.js";
import { tileAt } from "../shared/grid.js";

const opts = (over) => defaultOptions({ width: 48, height: 48, seed: 101, ...over });
const built = (over) => {
  const state = createState(opts(over));
  generateTerrain(state);
  return state;
};

test("the same seed and options generate an identical region", () => {
  const a = built();
  const b = built();
  assert.equal(hashState(a), hashState(b));
});

test("a different seed generates a different region", () => {
  assert.notEqual(hashState(built({ seed: 1 })), hashState(built({ seed: 2 })));
});

test("generated terrain is hashable — no floats leaked into elevation", () => {
  assertHashable(built());
});

test("elevation covers a range rather than a constant", () => {
  const state = built({ terrainStyle: "hilly" });
  const values = new Set(state.tiles.elevation);
  assert.ok(values.size > 20, `only ${values.size} distinct elevations`);
});

test("terrain style changes the relief, in the direction it claims", () => {
  const spread = (style) => {
    const state = built({ terrainStyle: style, seed: 55 });
    let low = 255;
    let high = 0;
    for (const value of state.tiles.elevation) {
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
    return high - low;
  };
  assert.ok(spread("flat") < spread("hilly"), "flat must be flatter than hilly");
  assert.ok(spread("rolling") <= spread("hilly"));
});

test("each water style produces the kind of water it promises", () => {
  const waterOf = (style) => {
    const survey = surveyTerrain(built({ waterStyle: style, seed: 77 }));
    return survey.water;
  };
  assert.equal(waterOf("none"), 0, "a dry region must have no water at all");
  assert.ok(waterOf("river") > 0, "a river region must have a river");
  assert.ok(waterOf("lakes") > 0);
  assert.ok(waterOf("coastal") > waterOf("river"), "a coast is wetter than a river");
  assert.ok(waterOf("archipelago") > waterOf("coastal"));
});

test("a river reaches across the region rather than stopping in the middle", () => {
  // A river that dead-ends is the classic generation bug: it looks fine on a
  // minimap and is useless for a water pump on the far side.
  const state = built({ waterStyle: "river", seed: 31 });
  const { width, height } = state;
  let touchesEdge = 0;
  for (let x = 0; x < width; x += 1) {
    if (isWater(state.tiles.terrain[x])) { touchesEdge += 1; break; }
  }
  for (let x = 0; x < width; x += 1) {
    if (isWater(state.tiles.terrain[(height - 1) * width + x])) { touchesEdge += 1; break; }
  }
  for (let y = 0; y < height; y += 1) {
    if (isWater(state.tiles.terrain[y * width])) { touchesEdge += 1; break; }
  }
  for (let y = 0; y < height; y += 1) {
    if (isWater(state.tiles.terrain[y * width + width - 1])) { touchesEdge += 1; break; }
  }
  assert.ok(touchesEdge >= 2, "a river should meet at least two edges");
});

test("deep water is always ringed by shallows, and shallows by sand", () => {
  // Readability rule from the design: the shoreline must be legible.
  const state = built({ waterStyle: "coastal", seed: 12 });
  const survey = surveyTerrain(state);
  let shallow = 0;
  for (const value of state.tiles.terrain) if (value === TERRAIN_SHALLOW) shallow += 1;
  assert.ok(shallow > 0, "no shoreline was generated");
  assert.ok(survey.sand > 0, "no beach was generated");
});

test("tree density controls how much forest appears", () => {
  const forestAt = (density) => surveyTerrain(built({ treeDensity: density, seed: 5 })).forest;
  assert.equal(forestAt(0), 0, "zero density means no trees");
  assert.ok(forestAt(80) > forestAt(20), "more density must mean more forest");
});

test("districts partition the buildable map without leaving orphans", () => {
  const state = built({ seed: 9 });
  const verdict = assignDistricts(state, 4);
  const stats = surveyDistricts(state, 4);
  const assigned = stats.reduce((sum, s) => sum + s.tiles, 0);
  assert.ok(assigned > state.width * state.height * 0.9, "most of the map should belong to a district");
  assert.equal(verdict.stats.length, 4);
});

test("district ids stay within the requested count", () => {
  const state = built({ seed: 14 });
  assignDistricts(state, 3);
  for (const id of state.tiles.district) {
    assert.ok(id >= 0 && id <= 3, `district id ${id} is out of range`);
  }
});

test("the fairness gate rejects an unequal partition", () => {
  const unfair = [
    { district: 1, tiles: 900, buildable: 900, water: 5, neighbours: [2] },
    { district: 2, tiles: 100, buildable: 50, water: 5, neighbours: [1] },
  ];
  const verdict = fairness(unfair);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /unequal/);
});

test("water access is reported, not required — groundwater works anywhere", () => {
  // This was a hard gate and rejected 116 of 200 regions: with one river and
  // eight districts most districts cannot touch water, and the gate was
  // refusing perfectly playable maps. Surface water is an advantage now.
  const stats = [
    { district: 1, tiles: 500, buildable: 400, water: 10, neighbours: [2] },
    { district: 2, tiles: 500, buildable: 400, water: 0, neighbours: [1] },
  ];
  const verdict = fairness(stats);
  assert.equal(verdict.ok, true, verdict.reason);
  assert.equal(verdict.withWater, 1, "how many districts have water is still reported");
  assert.deepEqual(verdict.dry, [2]);
});

test("scenario generation can still demand waterfront for every seat", () => {
  const verdict = fairness([
    { district: 1, tiles: 500, buildable: 400, water: 10, neighbours: [2] },
    { district: 2, tiles: 500, buildable: 400, water: 0, neighbours: [1] },
  ], true);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /water/);
});

test("the fairness gate rejects an isolated district", () => {
  const verdict = fairness([
    { district: 1, tiles: 500, buildable: 400, water: 10, neighbours: [] },
    { district: 2, tiles: 500, buildable: 400, water: 10, neighbours: [] },
  ]);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /touches no other/);
});

test("the fairness gate accepts a reasonable partition", () => {
  const verdict = fairness([
    { district: 1, tiles: 500, buildable: 400, water: 10, neighbours: [2] },
    { district: 2, tiles: 520, buildable: 380, water: 8, neighbours: [1] },
  ]);
  assert.equal(verdict.ok, true, verdict.reason);
  assert.equal(verdict.withWater, 2);
  assert.ok(verdict.spread >= 90);
});

test("generateWorld returns a region that passed the gate", () => {
  const result = generateWorld(opts({ seed: 2026, waterStyle: "river" }));
  assert.ok(result.ok, result.reason);
  assert.ok(result.districts.ok);
  assert.ok(result.attempts >= 1);
});

test("a re-roll is deterministic — the same input seed gives the same finished region", () => {
  // The seed the player typed must always produce the same region, even when
  // the first attempts were rejected by the gate.
  const a = generateWorld(opts({ seed: 3, waterStyle: "lakes" }));
  const b = generateWorld(opts({ seed: 3, waterStyle: "lakes" }));
  assert.equal(a.ok, b.ok);
  assert.equal(a.attempts, b.attempts);
  assert.equal(a.seed, b.seed, "the accepted seed must be reproducible");
  if (a.ok) assert.equal(hashState(a.state), hashState(b.state));
});

test("a dry region is generated, and runs on groundwater rather than failing", () => {
  // "Dry" is a legitimate lobby option and "supply water to a desert
  // settlement" is a named scenario.
  const result = generateWorld(opts({ seed: 4, waterStyle: "none", mode: "districts", seats: 4 }));
  assert.ok(result.ok, result.reason);
  assert.equal(result.survey.water, 0);
  for (const stat of result.districts.stats) assert.equal(stat.water, 0);
});

test("a district with no water is still refused when the region has water", () => {
  const verdict = fairness([
    { district: 1, tiles: 500, buildable: 400, water: 10, neighbours: [2] },
    { district: 2, tiles: 500, buildable: 400, water: 0, neighbours: [1] },
  ], true);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /water/);
});

test("the region describes itself from what was actually generated", () => {
  const state = built({ waterStyle: "archipelago", seed: 88 });
  const description = describeRegion(state);
  assert.ok(description.waterPercent > 0);
  assert.ok(["plain", "valley", "coast", "islands", "archipelago"].includes(description.shape));
  assert.ok(["level", "rolling", "mountainous"].includes(description.relief));
  assert.match(regionNameKey(description), /^region\.[a-z]+\.[a-z]+$/);
});

test("island counting ignores specks", () => {
  const state = createState(opts({ waterStyle: "none" }));
  generateTerrain(state);
  const islands = countIslands(state);
  assert.equal(islands.length, 1, "a dry map is one landmass");
});

test("water is never buildable and buildable is never water", () => {
  const state = built({ waterStyle: "coastal", seed: 61 });
  for (const value of state.tiles.terrain) {
    assert.ok(!(isBuildable(value) && isWater(value)), `terrain ${value} is both`);
  }
});

// --- rock and marsh (T2, A79) ------------------------------------------------

test("a hilly map has rock on it, and a rolling one still does not", () => {
  // One threshold for every style gave a hilly region almost no rock: the
  // peaks are higher but the elevation field is normalised, so 215 caught the
  // same share of a flatter map. A hilly map is the one you build around.
  const hilly = built({ terrainStyle: "hilly", waterStyle: "river", seed: 1003 });
  const rolling = built({ terrainStyle: "rolling", waterStyle: "river", seed: 1003 });
  assert.ok(surveyTerrain(hilly).rock > 20,
    `a hilly map has ${surveyTerrain(hilly).rock} rock tiles`);
  assert.equal(surveyTerrain(rolling).rock, 0, "a rolling map grew rock");
});

test("a river map has marsh where its shelf is widest, and a dry map has none", () => {
  const river = built({ waterStyle: "river", seed: 1003 });
  let marsh = 0;
  let onWideShelf = 0;
  for (let y = 0; y < river.height; y += 1) {
    for (let x = 0; x < river.width; x += 1) {
      if (river.tiles.terrain[tileAt(river.width, x, y)] !== TERRAIN_MARSH) continue;
      marsh += 1;
      // Every marsh tile stands where the shelf is wide, which is the rule —
      // not where a hash happened to land.
      let shallow = 0;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= river.width || ny >= river.height) continue;
          if (river.tiles.terrain[tileAt(river.width, nx, ny)] === TERRAIN_SHALLOW) shallow += 1;
        }
      }
      if (shallow >= 8) onWideShelf += 1;
    }
  }
  assert.ok(marsh >= 5, `${marsh} marsh tiles on a river map`);
  assert.equal(onWideShelf, marsh, "a marsh tile stands where the shelf is narrow");

  const dry = built({ waterStyle: "none", seed: 1003 });
  for (const value of dry.tiles.terrain) assert.notEqual(value, TERRAIN_MARSH, "a dry map grew marsh");
});

test("marsh is unbuildable, and the default map loses under 2% of its land to it", () => {
  assert.equal(isBuildable(TERRAIN_MARSH), false, "a marsh can be built on");
  assert.equal(isWater(TERRAIN_MARSH), false, "a marsh is water, so nothing can cross it");

  // The band costs the default map something, and the amount is the claim.
  // Measured over five seeds at T2 on a 64×64 `rolling` river map: 19 marsh
  // tiles of 4,096, buildable land 3,565 against 3,584. A shelf threshold of
  // seven put it at 40.6 tiles and 2.54% of this fixture's smaller map, over
  // A79's bound — eight is what fits it.
  let lost = 0;
  let total = 0;
  for (const seed of [1003, 2026, 7, 99, 70000]) {
    const state = built({ seed });
    const survey = surveyTerrain(state);
    let marsh = 0;
    for (const value of state.tiles.terrain) if (value === TERRAIN_MARSH) marsh += 1;
    lost += marsh;
    total += survey.buildable + marsh;
  }
  const share = (lost * 100) / total;
  assert.ok(share < 2, `the marsh band takes ${share.toFixed(2)}% of the default map's buildable land`);
  assert.ok(lost > 0, "no seed grew any marsh, so the bound above proves nothing");
});

// Renderer tests that need no browser.
//
// The renderer itself is gated by tools/client_smoke.mjs, which drives a real
// page. What can be tested here is everything pure: the constants mirror, the
// palette, and the deterministic hashing that decides what a building looks
// like. Those are also the parts that fail silently — a drifted constant or an
// indistinguishable pair of player colours produces a picture that looks fine
// and is wrong.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import * as mirror from "../client/constants-mirror.js";
import * as engine from "../engine/constants.js";
import { PLAYER_COLOURS, TERRAIN_COLOURS, ZONE_COLOURS, buildingColour } from "../client/render/palette.js";
import { PALETTES } from "../client/render/palettes.js";
import { pseudo, setFaceContrast, shade } from "../client/render/detail-kit.js";
import { faceContrastFor, lightingFor } from "../client/render/style-light.js";
import { zoneTint } from "../client/world/params.js";
import { NET_PRESENT } from "../engine/network.js";

test("the renderer's constants mirror matches the engine exactly", () => {
  // The renderer may not import engine/ — it reads state, it does not
  // participate in the rules — so the handful of constants it needs are
  // mirrored. A drifted mirror draws the wrong thing and nothing complains.
  for (const name of Object.keys(mirror)) {
    if (name === "NET_PRESENT") continue;
    assert.equal(mirror[name], engine[name], `${name} has drifted from engine/constants.js`);
  }
  assert.equal(mirror.NET_PRESENT, NET_PRESENT, "NET_PRESENT has drifted from engine/network.js");
});

test("the mirror covers everything the renderer actually reads", () => {
  const needed = [
    "ZONE_NONE", "ZONE_RESIDENTIAL", "ZONE_COMMERCIAL", "ZONE_INDUSTRIAL",
    "TERRAIN_GRASS", "TERRAIN_FOREST", "TERRAIN_WATER", "TERRAIN_SHALLOW",
    "FLAG_POWERED", "FLAG_WATERED", "FLAG_RUINED", "NET_PRESENT",
  ];
  for (const name of needed) {
    assert.ok(Object.hasOwn(mirror, name), `the mirror is missing ${name}`);
  }
});

test("there is a terrain colour for every terrain type", () => {
  const terrains = Object.keys(engine).filter((k) => k.startsWith("TERRAIN_") && typeof engine[k] === "number");
  assert.equal(TERRAIN_COLOURS.length, terrains.length,
    `${terrains.length} terrain types but ${TERRAIN_COLOURS.length} colours`);
});

test("there is a zone colour for every zone", () => {
  assert.equal(ZONE_COLOURS.length, 4);
});

// --- colour vision ----------------------------------------------------------

/** Brettel-style simulation, simplified: project the colour onto the plane a
 * given dichromat can see. Good enough to catch a pair that collapses. */
function simulate(hex, kind) {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  // Linearise, convert to LMS, flatten the missing channel, come back.
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const R = lin(r); const G = lin(g); const B = lin(b);
  const L = 0.31399 * R + 0.63951 * G + 0.04649 * B;
  const M = 0.15537 * R + 0.75789 * G + 0.08670 * B;
  const S = 0.01775 * R + 0.10944 * G + 0.87262 * B;
  let l = L; let m = M; let s = S;
  if (kind === "protan") l = 1.05118294 * M - 0.05116099 * S;
  if (kind === "deutan") m = 0.9513092 * L + 0.04866992 * S;
  if (kind === "tritan") s = -0.86744736 * L + 1.86727089 * M;
  const R2 = 5.47221206 * l - 4.6419601 * m + 0.16963708 * s;
  const G2 = -1.1252419 * l + 2.29317094 * m - 0.1678952 * s;
  const B2 = 0.02980165 * l - 0.19318073 * m + 1.16364789 * s;
  return [R2, G2, B2];
}

/** Perceptual-ish distance. Crude, but the question is only "could these two
 * be confused", and for that a Euclidean distance in linear light is enough. */
function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

test("player colours stay distinguishable under colour-vision deficiency", () => {
  // gamedesign.md §30: the palette is checked by simulation, not by eye.
  //
  // Sixteen distinguishable colours do not exist, which is exactly why player
  // identity is always colour PLUS pattern PLUS label. This test does not
  // pretend otherwise — it fails only when a pair collapses so far that the
  // colour carries no information at all, and it reports the worst pairs so
  // the palette can be improved deliberately.
  const seats = PLAYER_COLOURS.slice(1);
  const worst = [];
  for (const kind of ["protan", "deutan", "tritan", "normal"]) {
    const seen = seats.map((c) => (kind === "normal"
      ? [((c >> 16) & 0xff) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255]
      : simulate(c, kind)));
    for (let i = 0; i < seen.length; i += 1) {
      for (let j = i + 1; j < seen.length; j += 1) {
        worst.push({ kind, i: i + 1, j: j + 1, d: distance(seen[i], seen[j]) });
      }
    }
  }
  worst.sort((a, b) => a.d - b.d);
  const collapsed = worst.filter((w) => w.d < 0.045);
  assert.deepEqual(collapsed.map((w) => `${w.kind}:${w.i}/${w.j}`), [],
    `these seat colours collapse into each other:\n  ${collapsed.map((w) => `${w.kind} seats ${w.i} and ${w.j} (${w.d.toFixed(3)})`).join("\n  ")}`);
});

test("no two player colours are identical to begin with", () => {
  const seats = PLAYER_COLOURS.slice(1);
  assert.equal(new Set(seats).size, seats.length, "duplicate player colours");
});

test("there are sixteen player colours, one per seat", () => {
  assert.equal(PLAYER_COLOURS.length, 17, "index 0 is nature and is never drawn");
});

// --- determinism ------------------------------------------------------------

test("pseudo is deterministic, stable and spread", () => {
  // Every detail placement in the renderer hangs off this: which variant a
  // building gets, where a tree stands, what colour a parked car is. If it
  // changed between runs the city would shimmer.
  for (const n of [0, 1, 7, 1000, 65535]) {
    assert.equal(pseudo(n), pseudo(n), `pseudo(${n}) is not stable`);
  }
  const values = [];
  for (let i = 0; i < 2000; i += 1) values.push(pseudo(i));
  assert.ok(values.every((v) => v >= 0 && v < 1), "out of range");

  // Ten buckets, roughly even. Catches a hash that clumps, which would show up
  // as every building on a street picking the same variant.
  const buckets = new Array(10).fill(0);
  for (const v of values) buckets[Math.min(9, Math.floor(v * 10))] += 1;
  for (let i = 0; i < 10; i += 1) {
    assert.ok(buckets[i] > 100, `bucket ${i} has only ${buckets[i]} of 2000 — the hash clumps`);
  }
});

test("adjacent ids get different variants", () => {
  // Buildings on a street have consecutive ids. If the hash preserved that
  // order, a terrace would be four identical houses then four more.
  const variantOf = (id) => Math.floor(pseudo(id * 7 + 3) * 4) % 4;
  let runs = 0;
  for (let id = 1; id < 400; id += 1) {
    if (variantOf(id) === variantOf(id + 1)) runs += 1;
  }
  // A quarter of neighbours matching is what chance gives; far more than that
  // means the hash is not mixing.
  assert.ok(runs < 160, `${runs} of 399 consecutive ids share a variant`);
});

test("building colour lifts with value tier and stays in range", () => {
  const palette = { zone: ZONE_COLOURS };
  let previous = -1;
  for (let tier = 0; tier < 4; tier += 1) {
    const colour = buildingColour(1, tier, palette);
    assert.ok(colour >= 0 && colour <= 0xffffff, "out of range");
    const brightness = ((colour >> 16) & 0xff) + ((colour >> 8) & 0xff) + (colour & 0xff);
    assert.ok(brightness >= previous, "a higher value tier should not be darker");
    previous = brightness;
  }
});

test("the style palettes are complete", () => {
  for (const [name, palette] of Object.entries(PALETTES)) {
    for (const key of ["sky", "terrain", "tree", "zone", "road", "roadMark", "wire", "lamp", "civic"]) {
      assert.ok(palette[key] !== undefined, `${name} palette is missing ${key}`);
    }
    assert.equal(palette.terrain.length, TERRAIN_COLOURS.length, `${name} has the wrong terrain count`);
    assert.equal(palette.zone.length, 4, `${name} has the wrong zone count`);
  }
});

test("every style palette differs from every other", () => {
  // Three palettes that are the same palette are one style with three names —
  // which is exactly the mistake the first probe made.
  const names = Object.keys(PALETTES);
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const a = PALETTES[names[i]];
      const b = PALETTES[names[j]];
      const same = JSON.stringify(a) === JSON.stringify(b);
      assert.ok(!same, `${names[i]} and ${names[j]} are the same palette`);
    }
  }
});

// --- style separation -------------------------------------------------------

test("each style bakes a different face contrast", () => {
  // This is the setting that made the three candidates look alike: the shading
  // is baked into every vertex at build time, so it dominates the lights. If
  // two styles bake the same contrast they will read as one style with two
  // colour schemes, which is exactly the mistake that was called out.
  const contrasts = ["plain", "pixel", "painted"].map(faceContrastFor);
  assert.equal(new Set(contrasts).size, 3, `two styles bake the same contrast: ${contrasts}`);
  // Plain is the soft one and pixel is unlit, so the bake IS its light.
  assert.ok(faceContrastFor("plain") < faceContrastFor("painted"), "plain should bake softer than painted");
  assert.ok(faceContrastFor("pixel") > faceContrastFor("painted"), "pixel is unlit and needs the hardest bake");
});

test("plain is lit softly and painted is not", () => {
  const plain = lightingFor("plain");
  const painted = lightingFor("painted");
  // Softness is a RATIO, not a smaller key: the fill has to carry more of the
  // exposure than the key does, or the result is merely darker.
  assert.ok(plain.hemi > plain.key, "plain's fill should outweigh its key");
  assert.ok(painted.key > painted.hemi, "painted is a key-light style");
  assert.ok(plain.shadowIntensity < painted.shadowIntensity, "a soft style needs a pale shadow");
  assert.ok(plain.shadowRadius > painted.shadowRadius, "a soft style needs a blurred shadow");
  // A high sun drops the shadow under the building instead of stretching it.
  assert.ok(plain.sunHeight > painted.sunHeight, "plain's sun should stand higher");
});

test("the pixel style asks for no lighting at all", () => {
  assert.equal(lightingFor("pixel").key, 0, "pixel is unlit; a key light would gradient its flat faces");
});

test("face contrast pulls shades towards flat without inverting them", () => {
  setFaceContrast(1);
  assert.equal(shade(0.6), 0.6, "contrast 1 is the shades as written");
  setFaceContrast(0);
  assert.equal(shade(0.6), 1, "contrast 0 is fully flat");
  setFaceContrast(0.65);
  const soft = shade(0.6);
  assert.ok(soft > 0.6 && soft < 1, "a soft bake lifts a shade towards white");
  // Order must survive, or a roof stops reading as darker than its wall.
  assert.ok(shade(0.4) < shade(0.7), "contrast must not reorder shades");
  setFaceContrast(1);
});

// --- the map must show what the player built (P29) ---------------------------
//
// A playtest found three things the renderer silently did not draw. Each is a
// source assertion rather than a browser render, because what went wrong was
// structural: a pool that did not exist, a gate nothing satisfied, and a
// modulo. `tools/ui_smoke.mjs` counts the instances for real.

const instances = readFileSync(join(repoRoot, "client", "render", "instances.js"), "utf8");

test("an empty zoned lot is drawn", () => {
  // It was invisible until something developed on it: the player painted a
  // district and the map showed nothing back, so zoning appeared not to work.
  assert.match(instances, /make\("zone"/, "there is no pool for zoned ground");
  assert.match(instances, /pools\.zone/, "the zone pool is created and never filled");
  assert.match(instances, /state\.tiles\.zone\[index\]/,
    "nothing reads the zone layer while walking tiles");
});

test("a zoned lot stops being tinted once it is built on", () => {
  // Kjell's call (P29): subtle, and gone once the lot is built — a built lot
  // says what it is with a building.
  const block = instances.slice(instances.indexOf("pools.zone") - 400, instances.indexOf("pools.zone"));
  assert.match(block, /buildingId\[index\] === 0/,
    "the tint is drawn regardless of whether the lot is built on");
});

test("a power line is drawn on every tile it covers, not every third", () => {
  // Poles were the whole of it, on `(x + y) % 3`, and the LOD plan drops poles
  // below 14 pixels a tile — so a line the player had just drawn vanished as
  // soon as they zoomed out.
  // Drawn as a hub plus arms since P32, so the run joins across tile
  // boundaries rather than dotting each one.
  assert.match(instances, /make\("wireArm"/, "there is no continuous wire run");
  assert.match(instances, /connect\(pools\.wireHub, pools\.wireArm/);
  const runs = instances.slice(instances.indexOf("connect(pools.wireHub") - 320, instances.indexOf("connect(pools.wireHub"));
  assert.equal(/% 3/.test(runs), false, "the continuous run is gated on the pole modulo");
});

test("water pipes are drawn at all", () => {
  // They were gated on `options.underground === true`, which nothing anywhere
  // passed, so water mains had never been rendered.
  assert.match(instances, /pools\.pipe/);
  // The gate, not the word: the comment above the draw explains what the flag
  // used to do, and matching that would fail for describing the fix.
  assert.equal(/options\.underground|underground\s*&&/.test(instances), false,
    "the pipe draw is still behind a flag nothing sets");
});

test("the zone tint keeps enough of its own colour to tell R from C from I", () => {
  // The first attempt lightened 45% towards white and the three zones came out
  // as one pastel wash. The tint lives in the model now (client/world/params.js)
  // and is testable as a function rather than as a regex over the renderer.
  const palette = PALETTES.plain;
  const tints = [1, 2, 3].map((zone) => zoneTint(zone, palette));
  const channels = (hex) => [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
  for (const zone of [1, 2, 3]) {
    const base = channels(palette.zone[zone]);
    const tint = channels(tints[zone - 1]);
    for (let c = 0; c < 3; c += 1) {
      assert.ok(tint[c] >= base[c], "the tint lightens, never darkens");
      assert.ok(tint[c] <= Math.round(base[c] * 0.7 + 255 * 0.3) + 1, `zone ${zone} lost too much of its own colour`);
    }
  }
  const distance = (a, b) => Math.hypot(...channels(a).map((v, i) => v - channels(b)[i]));
  assert.ok(distance(tints[0], tints[1]) > 40 && distance(tints[1], tints[2]) > 40 && distance(tints[0], tints[2]) > 40,
    "the three zone tints are a pastel wash");
});

// --- networks read as networks (P32) ----------------------------------------

test("wire and pipe are drawn joined, like roads", () => {
  // The playtest: "power lines and water pipes do not look like they are
  // connected, just a dot on each tile". A square centred on each tile leaves a
  // gap at every boundary; roads avoid it by filling the tile. These draw a hub
  // plus an arm towards each neighbour the connection mask says they join.
  assert.match(instances, /function connect\(/, "there is no join helper");
  for (const pool of ["wireHub", "wireArm", "pipeHub", "pipeArm"]) {
    assert.match(instances, new RegExp(`make\\("${pool}"`), `no ${pool} pool`);
  }
  assert.match(instances, /connect\(pools\.wireHub, pools\.wireArm/);
  assert.match(instances, /connect\(pools\.pipeHub, pools\.pipeArm/);
});

test("an arm reaches exactly half a tile, so two neighbours meet", () => {
  // Half from each side. Shorter leaves the gap the playtest saw; longer
  // overlaps and doubles the colour where two runs meet.
  const helper = instances.slice(instances.indexOf("function connect("), instances.indexOf("export function updateInstances"));
  assert.match(helper, /0\.25/, "the arm is not offset a quarter tile from the centre");
  assert.match(helper, /mask & \(1 << d\)/, "the arm is not driven by the connection mask");
  assert.match(helper, /Math\.PI \/ 2/, "an east-west arm is not turned");
});

test("an isolated network tile still draws its hub", () => {
  // A single pole with nothing attached is something the player placed and
  // must be able to see — the hub is pushed before the mask is consulted.
  const helper = instances.slice(instances.indexOf("function connect("), instances.indexOf("export function updateInstances"));
  const hubAt = helper.indexOf("push(hubPool");
  const maskAt = helper.indexOf("const mask");
  assert.ok(hubAt >= 0 && hubAt < maskAt, "the hub is drawn conditionally on the mask");
});

// --- the ground closes up (P33) ----------------------------------------------

test("the road follows the ground, so an elevation step is not a green seam", () => {
  // A road quad is FLAT and sits at its own tile's height; the terrain under it
  // is a continuous surface with corner-averaged heights. Two neighbouring road
  // tiles two elevation levels apart therefore left a vertical step with
  // nothing in it, and the camera looked straight into the grass through it —
  // the "small green grass space between them" the playtest saw (P33).
  //
  // N28 filled the step with a skirt, which worked and cost six times the
  // triangles. N30 removes the question instead: the road is a colour of the
  // ground, so it shares the ground's corners and there is no step to fill.
  const terrain = readFileSync(join(repoRoot, "client", "render", "terrain.js"), "utf8");
  const chunk = terrain.slice(terrain.indexOf("function buildChunk("));
  assert.match(chunk, /cornerHeight/, "the ground no longer shares corners with its neighbours");
  // The road's colour moved into `world/ground-colour.js` with V3, which owns
  // every question about what the ground is coloured. It still paints roads.
  const source = readFileSync(join(repoRoot, "client", "world", "ground-colour.js"), "utf8");
  assert.match(source, /tiles\.road\[index\] & NET_PRESENT/, "the ground does not know a road when it sees one");
  assert.match(source, /palette\.road/, "the ground never paints a road");
});

test("a network ribbon is one width from end to end", () => {
  // A hub wider than its arms reads as a bead on a string, which is exactly
  // what "just a dot on each tile" describes — at city zoom the arm falls
  // under a pixel and only the bead survives. Same width, and the run reads as
  // a run at every zoom.
  const width = (pool) => {
    const match = new RegExp(`make\\("${pool}", flatGeometry\\(styleName, ([0-9.]+), ([0-9.]+)`).exec(instances);
    assert.ok(match, `${pool} is not a ribbon quad`);
    return { w: Number(match[1]), d: Number(match[2]) };
  };
  assert.equal(width("wireHub").w, width("wireArm").w, "the wire hub and arm are different widths");
  assert.equal(width("pipeHub").w, width("pipeArm").w, "the pipe hub and arm are different widths");
  // And each network keeps its own silhouette (ruling 030): a pipe main is
  // wider than a power line, or the overlay is the only way to tell them apart.
  assert.ok(width("pipeHub").w > width("wireHub").w, "wire and pipe are the same width");
});

test("wire and pipe cross a road instead of vanishing under it", () => {
  // Both were drawn below the road surface, so a run crossing a street broke
  // in two — the same complaint as the boundary gap, one tile wide. The road
  // surface IS the ground now (N30), so anything above the ground clears it —
  // but only just, and the margin is what this holds on to.
  const surface = 0.02;
  for (const [pool, name] of [["wire", "power line"], ["pipe", "water pipe"]]) {
    const height = /h \+ ([0-9.]+), (?:palette\.wire|PIPE_COLOUR)/.exec(
      instances.slice(instances.indexOf(`connect(pools.${pool}Hub`)),
    );
    assert.ok(height, `the ${name}'s height is not readable`);
    assert.ok(Number(height[1]) > surface, `the ${name} is drawn under the road surface`);
  }
});

// --- a road junction looks like a junction (P34) ------------------------------

test("road markings are drawn from the road's own connection mask", () => {
  // One centred dash per tile, turned to the road's axis, was the whole
  // marking: a crossroads got a single stripe pointing one way and a corner got
  // a stripe pointing across the turn. The mask already says which neighbours
  // a tile joins — the same four bits the network ribbons read (ruling 030).
  assert.match(instances, /function roadMarkings\(/, "there is no marking helper");
  const helper = instances.slice(instances.indexOf("function roadMarkings("),
    instances.indexOf("export function updateInstances"));
  assert.match(helper, /mask & \(1 << d\)/, "the marking is not driven by the connection mask");
  assert.match(helper, /bits/, "the marking does not count its connections");
});

test("a corner joins, a junction opens, a straight road keeps its dash", () => {
  const helper = instances.slice(instances.indexOf("function roadMarkings("),
    instances.indexOf("export function updateInstances"));
  // Three cases, and they have to be three: a corner's two arms MEET at the
  // centre or the elbow has a hole in it; a T or an X leaves the middle clear,
  // because painting a cross through a junction is not what a road does; a
  // straight run keeps the single centred dash that reads as a lane divider.
  assert.match(helper, /straight/, "a straight run is not distinguished");
  assert.match(helper, /bits >= 3/, "T and X junctions are not distinguished");
  assert.match(helper, /JUNCTION_GAP/, "a junction does not clear its middle");
});

test("the marking pools survive four arms a tile", () => {
  // Four per tile at an X, against one before. A pool that overflows drops
  // instances silently and the junctions nearest the edge of the screen lose
  // their markings.
  const mark = /make\("mark", [^;]+?, 0xffffff, (\d+)\)/.exec(instances);
  assert.ok(mark, "the mark pool is not readable");
  assert.ok(Number(mark[1]) >= 40000, `the mark pool is ${mark[1]}, too small for four arms a tile`);
});

// --- the budget was counting a fiction (P35) ---------------------------------

test("the road is painted into the ground, not stacked on top of it", () => {
  // N28 gave the road a skirt to close the green seam an elevation step showed
  // through. It worked and it cost 12 triangles a tile instead of 2 — 29,868
  // for the roads alone on a saturated 96x96, measured. The ground is already a
  // continuous surface with corner-averaged heights: colouring its tiles is
  // seamless BY CONSTRUCTION, costs nothing, and follows the terrain exactly.
  const source = readFileSync(join(repoRoot, "client", "world", "ground-colour.js"), "utf8");
  assert.match(source, /NET_PRESENT/, "the ground does not know a road when it sees one");
  assert.match(source, /palette\.road/, "the ground never paints a road");
  assert.equal(/make\("road", /.test(instances), false,
    "there is still a road instance pool stacked over the ground");
});

test("a network ribbon is a quad again, not a box", () => {
  // The same skirt, for the same reason, at 48,600 triangles for wire and pipe
  // together. They do not need it: a ribbon is drawn well above the road
  // surface, and that offset already clears any step a run crosses.
  for (const pool of ["wireHub", "wireArm", "pipeHub", "pipeArm"]) {
    assert.match(instances, new RegExp(`make\\("${pool}", flatGeometry\\(`),
      `${pool} is still a skirted box`);
  }
});

test("the triangle budget is spent against MEASURED ground costs", () => {
  // The cost table said `road: 2, // one upward quad` while the road was a
  // twelve-triangle box, and nothing charged for wire or pipe at all. The
  // planner believed 79,068 while the renderer drew 97,500 — over an 80,000
  // budget with the whole sacrifice ladder already spent, so a saturated city
  // rendered with no trees and no markings and was STILL over. Buildings and
  // trees have been measured since N1; the ground was remembered.
  assert.match(instances, /setCosts\(\{[\s\S]*?marking:/, "markings are not measured");
  assert.match(instances, /wireHub:/, "the wire ribbon is not measured");
  assert.match(instances, /pipeHub:/, "the pipe ribbon is not measured");
});

// --- the wiring the pure modules depend on (V1, V2) --------------------------
//
// A pure module is only worth its tests if something calls it. Each of these
// is the one line that connects a tested decision to the picture, and each of
// them is invisible to every other test in the suite.

test("the scene asks the governor before it draws an optional pass", () => {
  // `test/governor.test.js` proves the governor decides correctly. This is the
  // half that makes the decision mean anything (ruling 040).
  const scene = readFileSync(join(repoRoot, "client", "render", "scene.js"), "utf8");
  assert.match(scene, /governor\.allows\("shadows"\)/, "shadows ignore the governor");
  assert.match(scene, /tier\.post\.includes\(pass\) && governor\.allows\(pass\)/,
    "a post pass ignores the tier's list or the governor");
  assert.match(scene, /governor\.sample\(/, "nothing ever feeds the governor a frame time");
  assert.match(scene, /governor\.reset\(\)/, "a tier change does not reset the governor");
});

test("the frame time is measured where wall-clock time means something", () => {
  // In the render loop, not inside `draw` — `draw` is also called by the gates
  // and the screenshot harness, where the clock is meaningless and a governor
  // fed from it would sacrifice passes for no reason.
  const game = readFileSync(join(repoRoot, "client", "game.js"), "utf8");
  assert.match(game, /frameMs/, "the loop does not measure a frame");
  const scene = readFileSync(join(repoRoot, "client", "render", "scene.js"), "utf8");
  assert.equal(/const now = performance\.now/.test(scene), false,
    "the scene measures its own frame time and the gates will feed it garbage");
});

test("the cars are posed into the pools the parked ones use", () => {
  // One instance per car whether it is driving or parked, so the measured
  // budget sees it either way (ruling 019).
  const scene = readFileSync(join(repoRoot, "client", "render", "scene.js"), "utf8");
  assert.match(scene, /traffic\.pose\(pools, pushInstance, CAR_COLOURS\)/);
  assert.match(instances, /export function pushInstance\(/, "there is no way to add an instance");
  assert.match(scene, /plan\.cars !== false/, "the cars ignore the LOD plan");
});

test("a rebuilt world rebuilds the traffic with it", () => {
  // The lane graph is part of the model, so a car holding a link id from a
  // graph that no longer exists is a car in a field.
  const scene = readFileSync(join(repoRoot, "client", "render", "scene.js"), "utf8");
  const changed = scene.slice(scene.indexOf("function worldChanged()"),
    scene.indexOf("function showGhost("));
  assert.match(changed, /createModel\(state\)/);
  assert.match(changed, /createTraffic\(/, "the cars survive a rebuild of the graph they drive on");
});

test("?life=0 reaches the renderer, or no picture gate is repeatable", () => {
  const main = readFileSync(join(repoRoot, "client", "main.js"), "utf8");
  const game = readFileSync(join(repoRoot, "client", "game.js"), "utf8");
  assert.match(main, /params\.get\("life"\) !== "0"/);
  assert.match(main, /life: config\.life/, "the flag stops at the boot module");
  assert.match(game, /life: options\.life/, "the flag stops at the session");
});

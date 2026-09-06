// Toon shading and the anime rig (slice P1; ruling 033, spec §7.1–7.2).
//
// `painted` has been a lighting-and-palette treatment on Lambert materials
// since ruling 022 chose it — a style that differs from `plain` in tint and
// contrast and in nothing else. Ruling 017 is the standard it has to meet: a
// style is geometry, shading and palette, and a finish is the least of the
// four. This is the shading.
//
// three cannot be resolved in node — the vendored copy is reached through the
// page's importmap — so what is tested here is the pure half: the ramps
// themselves, the rig's numbers, and the palette through the colour-vision
// simulation. `client_smoke` and `style-sheet` drive the material.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { RAMPS, rampBytes } from "../client/render/ramps.js";
import { lightingFor, faceContrastFor } from "../client/render/style-light.js";
import { PALETTES } from "../client/render/palettes.js";
import { simulate, distance } from "./helpers/colour-vision.js";

const assets = readFileSync(join(repoRoot, "client", "render", "style-assets.js"), "utf8");
const styles = readFileSync(join(repoRoot, "client", "render", "styles.js"), "utf8");
const scene = readFileSync(join(repoRoot, "client", "render", "scene.js"), "utf8");

// --- the ramps ---------------------------------------------------------------

test("every named ramp exists and is a ramp", () => {
  assert.deepEqual(RAMPS, ["2", "3", "4", "soft", "soft3"]);
  for (const name of RAMPS) {
    const bytes = rampBytes(name);
    assert.ok(bytes.length >= 2, `${name} has ${bytes.length} steps`);
    for (let i = 1; i < bytes.length; i += 1) {
      assert.ok(bytes[i] >= bytes[i - 1], `${name} goes backwards at ${i}`);
    }
    assert.equal(bytes[bytes.length - 1], 255, `${name} does not reach full light`);
    assert.ok(bytes[0] < 255, `${name} has no shadow end`);
  }
});

test("a band count is a band count", () => {
  assert.equal(rampBytes("2").length, 2);
  assert.equal(rampBytes("3").length, 3);
  assert.equal(rampBytes("4").length, 4);
});

test("the soft ramps step more gently than the hard ones", () => {
  // "Soft" is not "fewer bands" — it is the same number of steps with the
  // transitions carrying some of the difference, which is what stops a toon
  // ramp reading as a poster.
  const biggest = (name) => {
    const b = rampBytes(name);
    let worst = 0;
    for (let i = 1; i < b.length; i += 1) worst = Math.max(worst, b[i] - b[i - 1]);
    return worst;
  };
  assert.ok(biggest("soft3") < biggest("3"), `soft3 steps ${biggest("soft3")}, 3 steps ${biggest("3")}`);
  assert.ok(biggest("soft") < biggest("2"), `soft steps ${biggest("soft")}, 2 steps ${biggest("2")}`);
});

test("an unknown ramp falls back rather than throwing", () => {
  // A style is data and a typo in it must not be a black screen.
  assert.deepEqual([...rampBytes("nonesuch")], [...rampBytes("3")]);
});

test("the ramp texture is NEAREST, or it is not a ramp at all", () => {
  // A linearly filtered gradient map interpolates between the bands and the
  // whole point of quantising is gone; it reads as slightly banded Lambert.
  assert.match(assets, /NearestFilter/, "the gradient map is not nearest-filtered");
  assert.match(assets, /magFilter/);
  assert.match(assets, /minFilter/);
});

// --- the style seam ----------------------------------------------------------

test("every style declares its rig, its shading and its finish", () => {
  // Spec §7.1: three fields per style, and nothing else in the renderer knows
  // which one it got.
  for (const name of ["plain", "pixel", "painted"]) {
    const entry = styles.slice(styles.indexOf(`  ${name}: {`));
    const body = entry.slice(0, entry.indexOf("\n  },"));
    for (const field of ["rig:", "shading:"]) {
      assert.match(body, new RegExp(field), `${name} does not declare ${field}`);
    }
  }
  assert.match(styles, /shading: "toon"/, "no style is toon-shaded");
  assert.match(styles, /rig: "anime"/, "no style uses the anime rig");
});

test("the material is chosen by the shading, not by the style's name", () => {
  // The seam is what lets a fourth style exist without touching the renderer.
  const make = assets.slice(assets.indexOf("export function makeMaterial("));
  const body = make.slice(0, make.indexOf("\n}"));
  assert.match(body, /shading/, "makeMaterial branches on the style name");
  assert.match(body, /MeshToonMaterial/);
  assert.equal(/=== "painted"/.test(body), false, "the material still knows a style by name");
});

// --- the anime rig -----------------------------------------------------------

test("the anime rig is a temperature split, not a dimmer", () => {
  // What makes a coloured shadow is the FILL, not the key: a strong cool light
  // from the opposite quarter carries the whole unlit side. A rig that only
  // turned the key up would give a brighter version of the same picture.
  const anime = lightingFor("painted");
  assert.ok(anime.fill > 0, "there is no fill light");
  assert.ok(anime.up > 0, "there is no up-light");
  const warm = (hex) => ((hex >> 16) & 0xff) - (hex & 0xff);
  assert.ok(warm(anime.keyColour) > 20, "the key is not warm");
  assert.ok(warm(anime.fillColour) < -10, "the fill is not cool");
  assert.ok(anime.fill / anime.key > 0.3,
    `fill ${anime.fill} against key ${anime.key} — the shadow side will be black`);
});

test("the toon ramp already quantises, so the baked contrast comes down", () => {
  // Face contrast is baked into every vertex at build time and a ramp quantises
  // on top of it; at 1.0 the two multiply and a wall reads as two flat sheets.
  assert.ok(faceContrastFor("painted") <= 0.4,
    `painted bakes ${faceContrastFor("painted")} of face contrast on top of a ramp`);
  assert.ok(faceContrastFor("painted") > 0, "a style with no baked contrast at all loses its form");
  assert.equal(faceContrastFor("plain"), 0.65, "plain's contrast moved");
  assert.equal(faceContrastFor("pixel"), 1.3, "pixel's contrast moved");
});

test("the scene builds the lights the rig names, and no others", () => {
  // A rig that names a fill and a scene that ignores it is a style that differs
  // in a data file and nowhere else.
  assert.match(scene, /lights\.fill/, "the fill light is never built");
  assert.match(scene, /lights\.up/, "the up-light is never built");
});

// --- the shadow frustum ------------------------------------------------------

test("the shadow camera follows the target and snaps to a texel", () => {
  // Unsnapped, every cast edge crawls as the view pans; on a row of fences at
  // street level that reads as shimmer (spec §7.2).
  assert.match(scene, /function followShadow|snapShadow/, "the shadow frustum is still fixed over the map");
  assert.match(scene, /shadow\.mapSize/);
  assert.match(scene, /Math\.round/, "nothing is snapped to anything");
});

// --- the shadow tint ---------------------------------------------------------

test("the toon patch checks the chunk it is patching", () => {
  // `onBeforeCompile` string surgery on three's own shader is the most brittle
  // thing in the renderer: a version bump changes a chunk and the patch either
  // does nothing or produces a shader that will not compile. It has to look
  // before it leaps, and say so when the shape is not what it expected.
  // The whole helper, not just from `onBeforeCompile`: the anchor it looks for
  // is a constant declared above it.
  const patch = assets.slice(assets.indexOf("const TOON_ANCHOR"), assets.indexOf("export function makeMaterial"));
  assert.match(patch, /getGradientIrradiance/, "the patch does not name what it is replacing");
  assert.match(patch, /includes\(|indexOf\(/, "the patch does not check the chunk first");
  assert.match(patch, /warn/, "a failed patch is silent");
});

// --- the painted palette -----------------------------------------------------

test("the painted palette is distinguishable under colour-vision deficiency", () => {
  // §30 and ruling 017: a style is geometry, shading AND palette, and a palette
  // that collapses for a dichromat is not a palette. The terrain table is the
  // one that matters — grass against forest against marsh is the distinction a
  // player reads the map by.
  const painted = PALETTES.painted;
  const worst = [];
  for (const kind of ["protan", "deutan", "tritan", "normal"]) {
    const seen = painted.terrain.map((c) => simulate(c, kind));
    for (let i = 0; i < seen.length; i += 1) {
      for (let j = i + 1; j < seen.length; j += 1) {
        worst.push({ kind, i, j, d: distance(seen[i], seen[j]) });
      }
    }
  }
  const collapsed = worst.filter((w) => w.d < 0.045);
  assert.deepEqual(collapsed.map((w) => `${w.kind}:${w.i}/${w.j}`), [],
    `these terrain colours collapse:\n  ${collapsed.map((w) => `${w.kind} ${w.i} and ${w.j} (${w.d.toFixed(3)})`).join("\n  ")}`);
});

test("painted is a different palette, not a tint of plain", () => {
  // Ruling 017's standard: three styles that differ only in tint are one style
  // with three filters on it.
  const a = PALETTES.plain;
  const b = PALETTES.painted;
  let moved = 0;
  for (let i = 0; i < a.terrain.length; i += 1) {
    if (a.terrain[i] !== b.terrain[i]) moved += 1;
  }
  assert.ok(moved >= a.terrain.length - 1, `${moved} of ${a.terrain.length} terrain colours differ`);
  assert.notEqual(a.sky, b.sky);
  assert.notEqual(a.road, b.road);
  assert.notDeepEqual(a.roof.house, b.roof.house);
});

test("the painted ground is less saturated than plain's, and its walls warmer", () => {
  // The direction the reference moves in: the ground drops back so the built
  // things carry the colour (spec §7.2, Higashiyama's PAL).
  const sat = (hex) => {
    const r = (hex >> 16) & 0xff; const g = (hex >> 8) & 0xff; const b = hex & 0xff;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
  };
  const grass = 0;
  assert.ok(sat(PALETTES.painted.terrain[grass]) < sat(PALETTES.plain.terrain[grass]),
    "painted grass is not less saturated than plain's");
  const warmth = (hex) => ((hex >> 16) & 0xff) - (hex & 0xff);
  assert.ok(warmth(PALETTES.painted.civic) > warmth(PALETTES.plain.civic),
    "painted walls are not warmer than plain's");
});

test("the rig's shadow fields are read by something", () => {
  // `shadowRadius` and `shadowIntensity` sat in this table from the day it was
  // written and nothing consulted them — a number in a table that nothing reads
  // is a decision nobody took (the same shape as P35's stale cost table).
  for (const style of ["plain", "painted"]) {
    const rig = lightingFor(style);
    assert.ok(Number.isFinite(rig.shadowRadius), `${style} has no shadow radius`);
    assert.ok(Number.isFinite(rig.shadowIntensity), `${style} has no shadow intensity`);
  }
  assert.match(scene, /shadow\.radius = lights\.shadowRadius/);
  assert.match(scene, /shadow\.intensity = lights\.shadowIntensity/);
  assert.ok(lightingFor("painted").shadowIntensity < 1,
    "a low sun at full shadow strength swallows the fill that colours it");
});

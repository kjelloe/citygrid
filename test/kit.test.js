// The building kit's contract (slice V6).
//
// `building-kit.js` imports three, so node cannot load it and the geometry
// itself is checked by `client_smoke` in a browser. What CAN be checked here is
// the thing that made this test necessary: the number of variants was written
// down twice, in `client/world/params.js` and in `client/render/building-kit.js`,
// and `variantFor` picks a variant from one while `createInstances` builds pools
// from the other. Raise one and not the other and `pools[kind + variant]` is
// `undefined` — every building of that variant simply stops being drawn, with
// no error and a green suite.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { hasPorch, hasPorchAtL2 } from "../client/world/house-spec.js";
import { homeForm, houseCount } from "../client/world/homes.js";
import { VARIANTS, variantFor, kindOf } from "../client/world/params.js";
import { PALETTES } from "../client/render/palettes.js";

const kit = () => readFileSync(join(repoRoot, "client", "render", "building-kit.js"), "utf8");

test("the number of variants is written down once", () => {
  assert.equal(/^export const VARIANTS = \d+;/m.test(kit()), false,
    "building-kit.js declares its own VARIANTS; it must take the one params.js has");
  assert.match(kit(), /VARIANTS[^\n]*from "\.\.\/world\/params\.js"/,
    "building-kit.js does not import VARIANTS from the model");
});

test("every category names every variant", () => {
  // The kit builds a pool per (category, variant), so a category that only
  // branches on 0..3 gives the same silhouette to 4 and 5 — which is not an
  // error, it is a city of clones.
  const source = kit();
  // Civic is not in this list since S1: it does not BRANCH on a variant at all
  // any more — it reads one mass table per definition, and
  // `test/civic-spec.test.js` checks that no two definitions come out the same
  // building, which is what this test is really asking.
  for (const category of ["function residential", "function commercial", "function industrial"]) {
    const body = source.slice(source.indexOf(category), source.indexOf("\n}", source.indexOf(category)));
    const named = new Set([...body.matchAll(/variant === (\d)/g)].map((m) => Number(m[1])));
    // 0 and the fall-through `else` need not be named; every other one must be.
    for (let v = 1; v < VARIANTS; v += 1) {
      assert.ok(named.has(v), `${category} never mentions variant ${v}`);
    }
  }
});

test("variantFor spreads over every variant", () => {
  const seen = new Set();
  for (let id = 1; id <= 400; id += 1) seen.add(variantFor(id));
  assert.equal(seen.size, VARIANTS, `only ${seen.size} of ${VARIANTS} variants ever come up`);
  // ...and not so unevenly that one is effectively absent.
  const counts = new Array(VARIANTS).fill(0);
  for (let id = 1; id <= 4000; id += 1) counts[variantFor(id)] += 1;
  const least = Math.min(...counts);
  assert.ok(least > 4000 / VARIANTS * 0.6, `the rarest variant is ${least} of 4000`);
});

test("a variant is a property of the building, not of the moment", () => {
  for (const id of [1, 7, 99, 1234]) assert.equal(variantFor(id), variantFor(id));
});

// --- the palette -------------------------------------------------------------

test("every style offers the same roof choices, so a style is not a different city", () => {
  const shapes = Object.values(PALETTES).map((p) => [p.roof.house.length, p.roof.flat.length]);
  for (const shape of shapes) assert.deepEqual(shape, shapes[0]);
});

test("there are enough roof colours that a street is not a pattern", () => {
  for (const [name, palette] of Object.entries(PALETTES)) {
    assert.ok(palette.roof.house.length >= 12, `${name} has ${palette.roof.house.length} house roofs`);
    assert.ok(palette.roof.flat.length >= 6, `${name} has ${palette.roof.flat.length} flat roofs`);
    // Distinct, or the count is a lie.
    assert.equal(new Set(palette.roof.house).size, palette.roof.house.length, `${name} repeats a house roof`);
    assert.equal(new Set(palette.roof.flat).size, palette.roof.flat.length, `${name} repeats a flat roof`);
  }
});

test("the roof choices are not all one hue", () => {
  // Terracotta, slate and a green or two. Measured as the spread of the hue
  // angle, because "more colours" that are all the same red is more of nothing.
  const hue = (hex) => {
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8) & 255) / 255;
    const b = (hex & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return 0;
    const d = max - min;
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return h * 60;
  };
  for (const [name, palette] of Object.entries(PALETTES)) {
    const hues = palette.roof.house.map(hue);
    const buckets = new Set(hues.map((h) => Math.floor(h / 45)));
    assert.ok(buckets.size >= 3, `${name}'s house roofs sit in ${buckets.size} hue bands`);
  }
});

test("every category the zones map to is one the kit builds", () => {
  const source = kit();
  for (const zone of [0, 1, 2, 3]) {
    assert.match(source, new RegExp(`function ${kindOf(zone)}\\(`), `no kit for ${kindOf(zone)}`);
  }
});

// --- the L2 box and the L3 house agree about the porch (slice S9) ------------

test("about as many houses have a porch from the air as from the pavement", () => {
  // E5's rule: the box a player sees at city zoom has to be the house they walk
  // up to. The box knows only its variant and the facade knows the id, so they
  // cannot match house for house — what they can do is agree about how common a
  // porch is, and this is the number that says whether they do.
  const atL2 = Array.from({ length: VARIANTS }, (_, v) => hasPorchAtL2(v)).filter(Boolean).length / VARIANTS;
  let atL3 = 0;
  const n = 400;
  for (let id = 1; id <= n; id += 1) if (hasPorch(id)) atL3 += 1;
  assert.ok(Math.abs(atL3 / n - atL2) < 0.15,
    `${Math.round(100 * atL3 / n)}% of houses and ${Math.round(100 * atL2)}% of boxes have a porch`);
});

test("the bungalow and the semi build their own, and are not given a second", () => {
  // Two porches on one house is the defect this predicate exists to prevent,
  // and it is invisible from the air — which is where the box is looked at.
  assert.equal(hasPorchAtL2(2), false, "the bungalow gets a second porch");
  assert.equal(hasPorchAtL2(4), false, "the semi gets a porch it has no door for");
  assert.ok(hasPorchAtL2(0) && hasPorchAtL2(1), "nothing else has one");
});

// --- the density ladder reaches the instanced pass (slice S10) ---------------

test("a lot draws one box per house, at both fidelities", () => {
  // E5's rule, and the whole point of S10: if the baked street is a pair of
  // semis and the box from the air is one slab across the lot, the player is
  // looking at two different cities depending on the zoom. Asserted through the
  // shared function and against the source of the pass that cannot be imported,
  // which is `instances.js` — it imports three.
  const instances = readFileSync(join(repoRoot, "client", "render", "instances.js"), "utf8");
  assert.match(instances, /houseLots\(lot, building\.level/,
    "the instanced pass still draws one box across the lot");
  for (const [w, d, level] of [[14, 14, 1], [34, 14, 1], [34, 34, 1], [14, 14, 2], [14, 14, 3]]) {
    assert.equal(houseCount(w, d, level), homeForm(w, d, level).houses.length);
  }
  // And the two levels that matter most in a played city are NOT one box.
  assert.ok(houseCount(34, 14, 1) > 1, "a two-tile level-1 lot is one building");
  assert.ok(houseCount(14, 14, 2) > 1, "a level-2 lot is one building");
});

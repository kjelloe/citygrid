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
import { pseudo } from "../client/render/detail-kit.js";
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
  // Read as text rather than imported: style-assets.js imports three, which
  // only the browser's importmap resolves.
  const source = readFileSync(join(repoRoot, "client", "render", "style-assets.js"), "utf8");
  for (const style of ["plain", "pixel", "painted"]) {
    const block = source.slice(source.indexOf(`${style}: {`));
    for (const key of ["sky", "terrain", "tree", "zone", "road", "roadMark", "wire", "lamp", "civic"]) {
      assert.ok(block.slice(0, 700).includes(`${key}:`), `${style} palette is missing ${key}`);
    }
  }
});

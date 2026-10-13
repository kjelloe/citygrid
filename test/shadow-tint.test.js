// The shadow's colour, driven rather than read (S22e, 2026-10-13).
//
// `test/toon.test.js` has asserted since P2 that the toon patch "checks the
// chunk it is patching" — by reading the SOURCE for a `warn` and an anchor
// name. It passed for the whole life of the patch while the patch did nothing,
// for two reasons at once:
//
//   1. `onBeforeCompile` is handed a shader whose `#include <…>` directives are
//      **not yet resolved**, so a replace aimed at a line inside
//      `lights_toon_pars_fragment` can never match; and
//   2. the anchor was wrong anyway — three's line ends `* directLight.color`
//      and the constant did not.
//
// So the painted style's shadows have darkened rather than taken a colour for
// the whole life of the rig, which is spec §7.2's temperature split, and the
// warning fired once into a console nobody collects. This file drives the real
// transforms over three's real chunks. `a-test-that-transcribes-a-line`, paid
// for again.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as THREE from "../vendor/three.module.js";
import { normalisedTint, tintedToonChunk, tintedLambertChunk, tintedOutgoing,
  TOON_ANCHOR, LAMBERT_ANCHOR, OUTGOING_ANCHOR } from "../client/render/shadow-shader.js";
import { getConfig } from "../client/world/config.js";

test("every anchor is a line three actually has", () => {
  // The half that was false: a patch whose anchor is not in the chunk is a
  // patch that does nothing, and nothing but a `console.warn` said so.
  assert.ok(THREE.ShaderChunk.lights_toon_pars_fragment.includes(TOON_ANCHOR),
    "the toon anchor is not in three's chunk");
  assert.ok(THREE.ShaderChunk.lights_fragment_begin.includes(LAMBERT_ANCHOR),
    "the Lambert anchor is not in three's chunk");
  assert.ok(THREE.ShaderChunk.meshlambert_frag.includes(OUTGOING_ANCHOR),
    "the outgoing-light anchor is not in the Lambert fragment shader");
  assert.ok(THREE.ShaderChunk.meshtoon_frag.includes(OUTGOING_ANCHOR),
    "the outgoing-light anchor is not in the toon fragment shader");
});

test("the toon chunk comes back with the tint mixed into its shadow", () => {
  const patched = tintedToonChunk(THREE.ShaderChunk.lights_toon_pars_fragment);
  assert.ok(patched, "the toon patch refused three's own chunk");
  assert.match(patched, /uShadowTint \* \( 1\.0 - irradiance\.r \)/);
  assert.ok(patched.includes(TOON_ANCHOR), "the patch dropped the line it was anchored on");
});

test("the Lambert chunk remembers how shadowed the pixel is, and the pixel spends it", () => {
  // A Lambert surface in shadow has simply lost the key light, so there is
  // nothing left to tint by the time the colour is assembled: the shadow has to
  // be kept where it is computed.
  const lighting = tintedLambertChunk(THREE.ShaderChunk.lights_fragment_begin);
  assert.ok(lighting, "the Lambert patch refused three's own chunk");
  assert.match(lighting, /float cgShadow = 1\.0;/, "nothing declares the shadow factor");
  assert.match(lighting, /cgShadow = min\( cgShadow, cgShadowOne \);/, "the factor is never kept");
  assert.match(lighting, /directLight\.color \*= cgShadowOne;/, "the light is no longer shadowed");

  const outgoing = tintedOutgoing(THREE.ShaderChunk.meshlambert_frag);
  assert.ok(outgoing, "the outgoing patch refused the Lambert fragment shader");
  assert.match(outgoing, /mix\( outgoingLight \* uShadowTint, outgoingLight, cgShadow \)/);
});

test("a patch that cannot find its anchor says so rather than pretending", () => {
  // The failure mode this file exists for: every transform returns `undefined`
  // on a chunk it does not recognise, and the caller warns. A transform that
  // returned the chunk unchanged would be the silent failure again.
  assert.equal(tintedToonChunk("nothing like a shader"), undefined);
  assert.equal(tintedLambertChunk("nothing like a shader"), undefined);
  assert.equal(tintedOutgoing("nothing like a shader"), undefined);
  assert.equal(tintedToonChunk(undefined), undefined);
});

test("a tint that is only a hue: the shadow keeps its value", () => {
  // "Cooler rather than darker" (A145) is a claim about LUMINANCE. The uniform
  // is the configured colour divided by its own luminance, so multiplying a
  // shadowed pixel by it moves the hue and leaves the value where S22d's ladder
  // put it — a raw `0x6f6ba8` would darken the shadow a second time.
  const tint = normalisedTint(new THREE.Color(getConfig().shadow.tint));
  const luminance = tint.r * 0.2126 + tint.g * 0.7152 + tint.b * 0.0722;
  assert.ok(Math.abs(luminance - 1) < 0.001,
    `the tint's luminance is ${luminance.toFixed(4)}; it has to be 1`);
  assert.ok(tint.b > tint.r, "a cool tint has more blue in it than red");
  assert.deepEqual(normalisedTint({ r: 0, g: 0, b: 0 }), { r: 1, g: 1, b: 1 },
    "a black tint would divide by zero; white is the no-op");
});

test("every chunk the renderer patches by name is a chunk three has", () => {
  // The whole renderer's shader patching, not just this module's. Both patching
  // files anchor on `#include <…>` directives, which is the only anchor that
  // survives `onBeforeCompile` — but a name three renames or drops in a version
  // bump fails exactly as silently as S22e's wrong anchor did. `fs` here rather
  // than an import because these modules import three themselves.
  const dir = new URL("../client/render/", import.meta.url);
  const named = new Map();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".js")) continue;
    const source = readFileSync(new URL(file, dir), "utf8");
    for (const [, chunk] of source.matchAll(/#include <([a-z_]+)>/g)) {
      if (!named.has(chunk)) named.set(chunk, file);
    }
  }
  assert.ok(named.size >= 7, `only ${named.size} chunk names found; the scan is not reading the renderer`);
  for (const [chunk, file] of named) {
    assert.ok(THREE.ShaderChunk[chunk] !== undefined,
      `${file} patches '#include <${chunk}>', which three has no chunk for`);
  }
});

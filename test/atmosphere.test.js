// Haze and sky, at two very different scales (slice V8; spec §7.3).
//
// The city camera's fog follows the ZOOM, and it has to: the same numbers are
// invisible on a 64-tile map and opaque on a 128-tile one. A walker's eye does
// not zoom, and street mode inherited the city's `span` anyway — so the fog at
// eye height was a function of how far out the player had been standing before
// they pressed F, which is a distance with no meaning down there.
//
// And the sky dome is a 1,800-tile sphere while street mode's far plane is 100,
// so at eye height the sky is entirely behind it: what the player saw was the
// clear colour, flat, with the dome's whole gradient thrown away — a low sun
// with no gradient under it is the one thing dusk is for.
//
// Pure, so both are arithmetic here rather than a screenshot somebody squints
// at.

import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, setConfig } from "../client/world/config.js";
import { fogFor, skyRadiusFor } from "../client/render/atmosphere.js";

setConfig(DEFAULTS);
const T = DEFAULTS.tileM;
const HOUR = { fogNear: 1.4, fogFar: 5, sky: 0xbfe0f0 };

const city = (span) => ({ mode: "city", span, persp: { near: 0.5, far: 4000 } });
const street = (span) => ({ mode: "street", span, persp: { near: 0.02, far: 100 } });

// --- the city camera, unchanged ------------------------------------------------

test("city fog follows the zoom, as it always has", () => {
  const near = fogFor(city(20), HOUR);
  const far = fogFor(city(80), HOUR);
  assert.ok(far.near > near.near && far.far > near.far, "the haze stopped following the span");
  assert.ok(Math.abs(near.near - 20 * HOUR.fogNear) < 1e-9);
  assert.ok(Math.abs(near.far - 20 * HOUR.fogFar) < 1e-9);
});

test("a tiny span does not put the haze inside the camera", () => {
  // The floor that has always been there: at span 2 a `fogNear` of 1.4 would be
  // three tiles, and a city fading out three tiles from the camera is a city in
  // a jar.
  const tight = fogFor(city(1), HOUR);
  assert.ok(tight.near >= 12 * HOUR.fogNear - 1e-9, `${tight.near}`);
});

test("orthographic has no haze at all", () => {
  // There is no horizon to fade into: the map fills the frame or the clear
  // colour does (V5).
  assert.equal(fogFor({ mode: "ortho", span: 40 }, HOUR), undefined);
});

// --- street mode ------------------------------------------------------------------

test("street fog is METRES, and does not care what the span was", () => {
  const a = fogFor(street(12), HOUR);
  const b = fogFor(street(80), HOUR);
  assert.deepEqual(a, b, "the haze at eye height still follows the city's zoom");
  assert.ok(Math.abs(a.near - DEFAULTS.fog.streetNear / T) < 1e-9, `${a.near} tiles`);
  assert.ok(Math.abs(a.far - DEFAULTS.fog.streetFar / T) < 1e-9, `${a.far} tiles`);
});

test("street fog still reaches further at dusk than at noon", () => {
  // The hour scales it, or a preset's `fogFar` stops meaning anything the
  // moment the player walks into the street.
  const noon = fogFor(street(20), { fogNear: 1.4, fogFar: 5 });
  const dusk = fogFor(street(20), { fogNear: 0.8, fogFar: 3 });
  assert.ok(dusk.far < noon.far, "the hour does not reach the street");
});

test("street fog is inside the far plane, or it never reaches full", () => {
  const fog = fogFor(street(20), HOUR);
  assert.ok(fog.far <= street(20).persp.far, `fog at ${fog.far} against a far plane of 100`);
});

// --- the dome ------------------------------------------------------------------------

test("the dome sits inside the far plane, whichever mode it is", () => {
  for (const view of [city(40), street(20)]) {
    const r = skyRadiusFor(view);
    assert.ok(r < view.persp.far, `a ${r}-tile dome behind a ${view.persp.far}-tile far plane`);
    assert.ok(r > 0);
  }
});

test("the dome is far bigger in the city than in the street", () => {
  assert.ok(skyRadiusFor(city(40)) > skyRadiusFor(street(20)) * 10);
});

test("the dome is beyond the fog, so it is a gradient and not a wall", () => {
  const view = street(20);
  assert.ok(skyRadiusFor(view) > fogFor(view, HOUR).far,
    "the sky is inside the haze, which paints it flat");
});

test("a view with no perspective planes falls back rather than throwing", () => {
  assert.ok(skyRadiusFor({ mode: "city", span: 40 }) > 0);
});

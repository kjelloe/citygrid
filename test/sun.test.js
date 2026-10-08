// Where the sun is (S22, P109 → A138).
//
// The defect this slice is about could not be seen by any test, because the
// thing that was wrong was a CONSTANT: `applyHour` set the key light to
// `(width × 0.6, sunHeight, height × 0.35)` at every hour, so the only thing
// the clock changed was the length of a shadow and the colour of the light.
// Nothing in `test/` could say "the light is in the same place at noon and at
// dusk" because nothing in `test/` could reach the renderer — so the direction
// moved into `client/world/sun.js`, which node can import, and these are the
// questions a frozen screenshot cannot answer.

import test from "node:test";
import assert from "node:assert/strict";
import { sunAt, lightPosition, SUN_BAND, MOON_BAND, BASE_AZIMUTH } from "../client/world/sun.js";
import { DEFAULTS } from "../client/world/config.js";
import { phaseOf } from "../client/render/time-of-day.js";

const PERIOD = 240;
const at = (fraction, over = DEFAULTS) => sunAt(fraction * PERIOD, over, PERIOD);
const degrees = (radians) => (radians * 180) / Math.PI;

test("the bands are the ones the preset clock actually uses", () => {
  // `phaseOf` lives in `client/render/`, which node cannot import for the usual
  // reason, so its boundaries are spelled again here — the two-lists shape. If
  // somebody moves a preset boundary, this is what says the sun no longer rises
  // when the day does.
  assert.equal(phaseOf(SUN_BAND.from * PERIOD, PERIOD), "day");
  assert.equal(phaseOf((SUN_BAND.to - 0.01) * PERIOD, PERIOD), "sunset");
  assert.equal(phaseOf(MOON_BAND.from * PERIOD, PERIOD), "night");
  assert.equal(phaseOf((MOON_BAND.to - 0.01) * PERIOD, PERIOD), "night");
  assert.equal(phaseOf(MOON_BAND.to * PERIOD, PERIOD), "sunset");
});

test("the sun crosses the sky, and noon is where the light always was", () => {
  // The middle of the arc is the azimuth the whole project was lit from, so
  // every screenshot in `reports/` is still the picture it was at noon. A slice
  // that moved the light at midday would be a slice about the look.
  const middle = at((SUN_BAND.from + SUN_BAND.to) / 2);
  assert.equal(middle.body, "sun");
  assert.ok(Math.abs(degrees(middle.azimuth - BASE_AZIMUTH)) < 2,
    `${degrees(middle.azimuth - BASE_AZIMUTH).toFixed(1)}° off the old azimuth at noon`);
});

test("the arc is a quarter of the sky, end to end", () => {
  // A138's decision, as a number this test reads from the data rather than
  // transcribes: the sweep from the first second of daylight to the last must
  // be `sun.arcDegrees` wide.
  const dawn = at(SUN_BAND.from);
  const dusk = at(SUN_BAND.to - 0.001);
  const swept = Math.abs(degrees(dusk.azimuth - dawn.azimuth));
  assert.ok(Math.abs(swept - DEFAULTS.sun.arcDegrees) < 2,
    `swept ${swept.toFixed(1)}° of a declared ${DEFAULTS.sun.arcDegrees}°`);
});

test("the azimuth only ever advances while a body is up", () => {
  // Monotone, because a light that goes backwards is a day running backwards.
  // Asked across the sun's band and the moon's separately: between them the two
  // are half a turn apart, so the series as a whole is not monotone and must
  // not be asserted to be.
  for (const band of [SUN_BAND, MOON_BAND]) {
    let last = -Infinity;
    for (let i = 0; i <= 40; i += 1) {
      const where = at(band.from + (band.to - band.from) * (i / 41));
      assert.ok(where.azimuth >= last,
        `the ${where.body} went backwards at ${(i / 41).toFixed(2)} of its band`);
      last = where.azimuth;
    }
  }
});

test("the moon takes the night, on its own arc and half a turn away", () => {
  // Not a continuation of the sun's: the night preset was already a dim, cool,
  // HIGH key — a moon standing in for a sun without saying so — and naming it
  // is what lets a night shadow fall the other way.
  const night = at((MOON_BAND.from + MOON_BAND.to) / 2);
  assert.equal(night.body, "moon");
  const apart = Math.abs(degrees(night.azimuth - BASE_AZIMUTH));
  assert.ok(apart > 150 && apart < 210, `the moon is ${apart.toFixed(0)}° from the sun's noon`);
});

test("dawn holds still rather than teleporting", () => {
  // The late `sunset` band (0.9 to 1) is dawn with the dusk preset reused: the
  // sun has not risen and the moon has set. The light holds at the end of the
  // moon's arc, because a light that jumps between two frames is worse than one
  // that stands still — and the next second after it is the sun's first.
  const held = [at(MOON_BAND.to), at(0.95), at(0.999)];
  for (const where of held) assert.equal(where.body, "moon");
  assert.equal(held[0].azimuth, held[1].azimuth);
  assert.equal(held[1].azimuth, held[2].azimuth);
});

test("the same second gives the same answer, always", () => {
  // `?life=0` freezes the sun because this takes a number and reads nothing
  // else. Two frozen screenshots must be the same bytes, which is a claim about
  // this function before it is a claim about the renderer.
  for (const fraction of [0, 0.13, 0.4, 0.61, 0.7, 0.89, 0.95]) {
    const once = at(fraction);
    const twice = at(fraction);
    assert.deepEqual(once, twice);
    // And a day later is the same hour.
    assert.deepEqual(sunAt(fraction * PERIOD + PERIOD * 3, DEFAULTS, PERIOD), once);
  }
});

test("the steps are what hold the light still between them", () => {
  // The shadow frustum is snapped to a shadow TEXEL so edges do not crawl as
  // the view pans; a light that rotates turns the texel grid itself, which
  // brings the crawl back with nobody panning. Quantising the arc makes the
  // light static for a span of frames — the same shape as the hysteresis B7's
  // estimate needed.
  const stepped = { ...DEFAULTS, sun: { ...DEFAULTS.sun, arcSteps: 4 } };
  const seen = new Set();
  for (let i = 0; i <= 60; i += 1) {
    seen.add(at(SUN_BAND.from + (SUN_BAND.to - SUN_BAND.from) * (i / 61), stepped).azimuth);
  }
  assert.equal(seen.size, 5, `${seen.size} distinct azimuths over four steps`);
  // Continuous when asked for, so the gate can measure one against the other.
  const smooth = { ...DEFAULTS, sun: { ...DEFAULTS.sun, arcSteps: 0 } };
  const many = new Set();
  for (let i = 0; i <= 60; i += 1) {
    many.add(at(SUN_BAND.from + (SUN_BAND.to - SUN_BAND.from) * (i / 61), smooth).azimuth);
  }
  assert.ok(many.size > 50, `${many.size} distinct azimuths with no steps`);
});

test("the light stands off the larger side of the map, not off each side", () => {
  // The rig had `0.6 × width` and `0.35 × height` as separate constants, so on
  // a map twice as wide as it is tall the light was not where the azimuth said
  // — it pointed somewhere else entirely, and the shadow direction was a
  // function of the map's proportions.
  const square = lightPosition(BASE_AZIMUTH, 120, 64, 64);
  const wide = lightPosition(BASE_AZIMUTH, 120, 128, 64);
  const angleOf = (p, w, h) => Math.atan2(p.x - w / 2, p.z - h / 2);
  assert.ok(Math.abs(angleOf(square, 64, 64) - BASE_AZIMUTH) < 1e-9);
  assert.ok(Math.abs(angleOf(wide, 128, 64) - BASE_AZIMUTH) < 1e-9,
    "the azimuth changed with the map's proportions");
  assert.equal(square.y, 120);
});

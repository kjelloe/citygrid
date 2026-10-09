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
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

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
  const square = lightPosition(BASE_AZIMUTH, 120, 64, 64, DEFAULTS.sun);
  const wide = lightPosition(BASE_AZIMUTH, 120, 128, 64, DEFAULTS.sun);
  const angleOf = (p, w, h) => Math.atan2(p.x - w / 2, p.z - h / 2);
  assert.ok(Math.abs(angleOf(square, 64, 64) - BASE_AZIMUTH) < 1e-9);
  assert.ok(Math.abs(angleOf(wide, 128, 64) - BASE_AZIMUTH) < 1e-9,
    "the azimuth changed with the map's proportions");
  assert.equal(square.y, 120);
});

// --- S22b: the sun stands further out (A139) ---------------------------------

test("the light's radius is data, and the elevation it buys is the point (S22b)", () => {
  // S22 made the sun MOVE and Q164 asked whether the thing it moves is big
  // enough to see: the key light stood at `max(w, h) × 0.18` against a
  // `sunHeight` of 120 tile-units, which is **83.4° of elevation at noon** —
  // almost overhead, where a quarter of the sky moves a short shadow a little.
  // A139 took the radius to about 0.5, so noon is near 45° and the same arc
  // moves a shadow long enough to see.
  //
  // Measured as an ANGLE rather than as the constant, because the elevation is
  // what a player sees and the radius is only how it is spelled.
  // `base` is the STYLE's key-light height — `plain` stands it at 150 — and the
  // hour's own height is that times the preset's factor.
  const elevation = (radius, { size = 64, base = 150, factor = 1 } = {}) => {
    const y = base * factor;
    const stood = lightPosition(BASE_AZIMUTH, y, size, size, { ...DEFAULTS.sun, radius }, base);
    const flat = Math.hypot(stood.x - size / 2, stood.z - size / 2);
    return Math.round((Math.atan2(stood.y, flat) * 180) / Math.PI * 10) / 10;
  };
  const now = elevation(DEFAULTS.sun.radius);
  assert.ok(now > 40 && now < 50, `noon stands at ${now}°, and A139 asked for near 45°`);

  // **The same angle on every map AND in every style.** The old
  // fraction-of-the-map radius was 84.5° on a 64 and 79.1° on a 128 — a bigger
  // region had a lower sun — and measuring the radius against the HOUR's height
  // instead made every hour 45°, which is the other failure: it cancelled the
  // preset factor that makes a dusk sun low.
  for (const size of [48, 96, 128]) {
    assert.equal(elevation(DEFAULTS.sun.radius, { size }), now, `a ${size} map has a different sun`);
  }
  assert.equal(elevation(DEFAULTS.sun.radius, { base: 60 }), now,
    "a style that stands its key light lower has a different sun");

  // And the preset's factor still lowers it, which is what the dusk frame is.
  const dusk = elevation(DEFAULTS.sun.radius, { factor: 0.22 });
  assert.ok(dusk < 20, `dusk stands at ${dusk}°, and a dusk sun is a low sun`);
});

test("a longer shadow is a longer shadow, at every hour of the arc (S22b)", () => {
  // The gate for the change is a picture, and this is the arithmetic under it:
  // a shadow's length is the height over the tangent of the elevation, so the
  // ratio between the two radii is the ratio between the shadows. Held at
  // three hours rather than one, because the arc changes the azimuth and a
  // single hour could be the one place the two agree.
  // A shadow's length is the reach over the height, so the two arms are the two
  // GEOMETRIES: 0.18 of a 64 map against 1.0 of the rig's 150.
  const shadow = (reach) => reach / 150;
  const was = shadow(64 * 0.18);
  const now = shadow(150 * DEFAULTS.sun.radius);
  assert.ok(now > was * 2, `the shadow went ${was.toFixed(2)} → ${now.toFixed(2)} of a wall's height`);
  // And the arc still moves it: three hours, three azimuths, so the shadow
  // points three ways at the same length.
  const ways = new Set([0.25, 0.45, 0.58].map((phase) => {
    const { azimuth } = sunAt(240 * phase, DEFAULTS, 240);
    return Math.round((azimuth * 180) / Math.PI);
  }));
  assert.equal(ways.size, 3, `three hours gave ${ways.size} directions: ${[...ways].join(", ")}`);
});

test("the radius is the mirror's too, or a tool lights a different city (S22b)", () => {
  // `client/world/config.js` is the FALLBACK the renderer boots offline with
  // and the numbers a node tool gets from `setConfig(DEFAULTS)`. A radius in
  // one and not the other is two suns.
  const file = JSON.parse(readFileSync(join(repoRoot, "data", "cityviewer.json"), "utf8"));
  assert.equal(file.sun.radius, DEFAULTS.sun.radius,
    "data/cityviewer.json and the mirror disagree about where the sun stands");
});

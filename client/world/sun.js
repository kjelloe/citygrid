// Where the sun is, and where the moon is after it (S22, P109 → A138).
//
// **The finding this module exists for:** the key light's x and z were
// CONSTANTS. `applyHour` in `client/render/scene.js` rewrote the light's
// position every time the hour changed and rewrote it to the same x and z — only
// `y` moved — so every shadow in every city at every hour of every game fell the
// same way, and the only thing the clock changed was their length and the
// light's colour. Shade was a fixture of the map rather than a time of day.
//
// Pure, and in `client/world/` for three reasons that are all the same reason:
// node can import it, `test/sun.test.js` can ask it questions without a browser,
// and `?life=0` freezes the sun because the only thing it reads is a number the
// caller passes in. No three, no DOM, no clock of its own (ruling 032).
//
// **The clock is the WALL clock** (A41/R2: at the play speed 48 ticks was a
// nineteen-second day), and in a room it is the ROOM's played clock (X1c), so
// every seat is at one hour. This takes `seconds` exactly as `phaseOf` does.
//
// The presets are untouched. A138 is explicit: the four composed hours are a
// composition and a slider through them passes through hours nobody composed
// (spec §7.3), so colour and intensity stay composed and only the DIRECTION
// becomes continuous.

/** When the sun is up, as a fraction of the day — `phaseOf`'s `day`, `rain` and
 * the first `sunset` band, which is 0 to 0.62. Spelled here as the numbers
 * `phaseOf` uses rather than imported from `client/render/time-of-day.js`,
 * which node cannot have: `test/sun.test.js` asserts the two agree, which is
 * the two-lists-of-hashed-fields shape for a boundary a module cannot cross. */
export const SUN_BAND = { from: 0, to: 0.62 };

/** And when the moon is, which is `phaseOf`'s `night`. The late `sunset` band
 * (0.9 to 1) is dawn with the dusk preset reused, and it belongs to neither:
 * the sun has not risen and the moon has set, so the light holds still through
 * it — the one part of the day where a fixed azimuth is the right answer. */
export const MOON_BAND = { from: 0.62, to: 0.9 };

/**
 * How far out the light stands, **as a multiple of how high it stands**.
 * `sun.radius` in `data/cityviewer.json` is the real one; this is the fallback
 * for a caller with no config.
 *
 * **The unit changed with the value** (S22b, A139). It used to be a fraction of
 * the larger map side — `0.18`, which is the rig's old `(width × 0.6, y,
 * height × 0.35)` at `BASE_AZIMUTH` — and that made the sun's ELEVATION a
 * function of the region's size: against a `sunHeight` of 120 tile-units it
 * stood at 84.5° on a 64, 81.8° on a 96 and 79.1° on a 128. A sun that is
 * lower over a bigger region is not a thing anybody chose.
 *
 * Measured against `SUN_HEIGHT` instead — the preset table's full-height unit —
 * `radius` IS the elevation at noon: `1.0` is 45° on every map, and a preset
 * with a lower `sunHeight` stands the sun LOWER rather than nearer, which is
 * the shape the old geometry had and the thing the dusk frame is for.
 *
 * A139 asked for "about 0.5 of the map, so noon is near 45°", and those two
 * cannot both hold on any size this game ships: 0.5 of a 96 map is 68°. The
 * ANGLE is the decision, so the angle is what is implemented, and `sun_shots`
 * prints the ladder so the choice stays re-judgeable from numbers.
 */
const REACH = 1.0;

/** The fallback for a rig that names no height — the `?? 120` `scene.js` has
 * defaulted to in three places. The real one is the STYLE's (`plain` stands its
 * key light at 150 tile-units and another style at 60), and it is the number
 * `radius` is measured against: the same radius is then the same ANGLE in every
 * style, which is the whole point of S22b. */
export const SUN_HEIGHT = 120;

/** The azimuth the city was lit from for the whole project before this slice:
 * `atan2(+0.1 w, −0.15 h)`, about 146°, which on a 64 map is `(+6.4, −9.6)` of
 * the centre. It is the MIDDLE of the arc rather than its start, so noon is lit
 * exactly as every screenshot in `reports/` was and the arc opens either side of
 * it. A slice that moved the light at noon would be a slice about the look. */
export const BASE_AZIMUTH = Math.atan2(0.1, -0.15);

const span = (band) => band.to - band.from;

/**
 * The light's direction at `seconds` on a `period`-second day.
 *
 * @returns `{ body, azimuth, fraction }` — which body is up, where it is in
 *   radians, and how far through its own arc it has travelled (0 to 1). The
 *   CALLER turns an azimuth into a position, because how high the light stands
 *   is the preset's business (`sunHeight`) and this module does not know it.
 *
 * `arcDegrees` is a quarter of the sky (A138) and `moonArcDegrees` is the
 * moon's own, both from `data/cityviewer.json` so Kjell can move the rate
 * without a slice. **The moon starts half a turn from the sun**, which is what
 * makes a night shadow fall the other way — the thing the feature is for.
 *
 * `steps` quantises the arc: the light is then static for a span of frames.
 * `followShadow` snaps the shadow frustum to a shadow texel so edges do not
 * crawl as the view PANS, and a light that rotates turns the texel grid itself,
 * which reintroduces exactly that crawl with nobody panning. 0 is continuous.
 */
export function sunAt(seconds, cfg, period) {
  const sun = cfg.sun;
  const phase = ((seconds % period) + period) % period / period;
  const moon = phase >= MOON_BAND.from && phase < MOON_BAND.to;
  const band = moon ? MOON_BAND : SUN_BAND;
  const arc = (moon ? sun.moonArcDegrees : sun.arcDegrees) * Math.PI / 180;
  // Past the sun's band and before the moon's there is no body in the sky: dawn
  // holds at the end of the moon's arc rather than jumping back, because a
  // light that teleports between two frames is worse than one that stands
  // still.
  const raw = phase >= MOON_BAND.to
    ? 1
    : Math.min(1, Math.max(0, (phase - band.from) / span(band)));
  const steps = sun.arcSteps > 0 ? sun.arcSteps : 0;
  const fraction = steps > 0 ? Math.round(raw * steps) / steps : raw;
  const base = BASE_AZIMUTH + (moon || phase >= MOON_BAND.to ? Math.PI : 0);
  return {
    body: moon || phase >= MOON_BAND.to ? "moon" : "sun",
    azimuth: base + (fraction - 0.5) * arc,
    fraction,
  };
}

/**
 * Where to stand a light that is `azimuth` round a `width` × `height` map, in
 * map units, at height `y`.
 *
 * `cfg` is the `sun` block and its `radius` is a multiple of `baseHeight` — the
 * STYLE's key-light height, before the hour's preset factor (S22b). So
 * `radius: 1.0` is 45° at noon in every style and on every map, a preset that
 * stands the sun lower gets a lower sun rather than a nearer one, and the arc's
 * azimuth is the only thing the map's shape still touches. `scene.js` had `0.6 w` and `0.35 h` as
 * separate constants, which on a map twice as wide as it is tall pointed
 * somewhere else entirely; the fraction-of-the-map radius that replaced them
 * fixed the direction and left the elevation depending on the region's size.
 */
export function lightPosition(azimuth, y, width, height, cfg, baseHeight) {
  // The RIG's height, not the hour's: the preset's `sunHeight` factor is what
  // makes a dusk sun low, and dividing the reach by it too would cancel exactly
  // that — every hour would read the same elevation, which is what the first
  // version of this did (45.0° at dawn, noon, dusk and midnight alike).
  const reach = (baseHeight ?? SUN_HEIGHT) * (cfg?.radius ?? REACH);
  return {
    x: width / 2 + Math.sin(azimuth) * reach,
    y,
    z: height / 2 + Math.cos(azimuth) * reach,
  };
}

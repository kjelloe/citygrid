// The hour on the road (slice B4).
//
// A city whose traffic is the same at three in the morning as at half past five
// is a city with no day in it. The engine's own load says how busy a STREET is;
// this says how busy the HOUR is, and the two multiply.
//
// Pure and in the world layer because it is a curve, and a curve is the kind of
// thing that should be argued about in a test rather than tuned in a browser.
// `client/life/traffic.js` asks it; `phaseOf` in the renderer names the same
// clock's presets for the light rig.
//
// Q86/A63: in a room the hour is the server's, within a game hour. In
// singleplayer it is the player's own setting. Either way both clients scale
// their traffic by the same curve, so two players describing the same street
// are describing the same time of day.

/** The phases of a day, as fractions of it, and what the road does in each.
 *
 * The shape matches `phaseOf`'s: over half the day is daylight, dusk is short,
 * and night is long. The two rushes sit at the start and the end of the working
 * day rather than at the sun's own extremes — people leave before the light
 * does. */
const CURVE = [
  { at: 0.00, load: 0.55 },   // early morning, the road waking up
  { at: 0.08, load: 1.30 },   // the morning rush
  { at: 0.18, load: 0.95 },   // the working day
  { at: 0.44, load: 1.30 },   // the evening rush
  { at: 0.55, load: 0.80 },   // sunset, thinning
  { at: 0.70, load: 0.40 },   // night
  { at: 0.92, load: 0.40 },
  { at: 1.00, load: 0.55 },   // and round to the morning again
];

/** The quietest and busiest the hour may make a street. Exported because the
 * test asserts the curve stays inside them and `lanes_dump` prints them. */
export const RUSH_MIN = 0.4;
export const RUSH_MAX = 1.3;

/**
 * How busy the hour is, as a multiplier on a link's target density.
 *
 * `phase` is 0..1 through the day — the same number `phaseOf` buckets into
 * presets. Interpolated rather than stepped: a road that quadrupled its cars
 * the instant the clock crossed a boundary would be a visible pop, and the
 * whole point of a rush hour is that it arrives.
 */
export function rushScale(phase) {
  if (!Number.isFinite(phase)) return 1;
  const p = ((phase % 1) + 1) % 1;
  for (let i = 1; i < CURVE.length; i += 1) {
    const a = CURVE[i - 1];
    const b = CURVE[i];
    if (p > b.at) continue;
    const t = b.at === a.at ? 0 : (p - a.at) / (b.at - a.at);
    return a.load + (b.load - a.load) * t;
  }
  return CURVE[CURVE.length - 1].load;
}

/** Which way the traffic is flowing, for the door pass: `out` in the morning
 * (homes emit, shops receive), `in` in the evening, `none` between.
 *
 * Named rather than a number, because it decides which END of a link a car
 * appears at and a signed scalar would be one more thing to get backwards. */
export function tideAt(phase) {
  const p = ((phase % 1) + 1) % 1;
  if (p >= 0.02 && p < 0.16) return "out";
  if (p >= 0.40 && p < 0.52) return "in";
  return "none";
}

/** Where in the day a PINNED hour sits, 0..1.
 *
 * The light can be pinned to a preset (spec §7.3) and the traffic has to agree
 * with it: a player who pins night and sees a rush hour outside is looking at
 * two different times of day in one window. The numbers are the middles of
 * `phaseOf`'s own bands.
 */
export function phaseForPreset(name) {
  if (name === "night") return 0.76;
  if (name === "sunset") return 0.56;
  return 0.25;
}

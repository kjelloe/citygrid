// Ambient motion (slice S6, spec §9.4).
//
// Restrained movement where the eye expects it: trees sway, a turbine turns,
// a stack smokes, a flag stirs, a crane slews over a building site. Nothing
// bounces and nothing pulses.
//
// Every motion is a formula of one clock, and every one is still at t = 0 —
// sway, rotor and crane are exactly zero there, smoke and flag hold a rest pose
// that depends on nothing but the instance. The clock does not advance while
// life is off, which is what reduced motion and `?life=0` both are, so a frozen
// screenshot is the same bytes twice.
//
// The shader (`client/render/motion-material.js`) takes its numbers from
// `MOTION` here, so the constants exist once and node can test them.

export const MOTION = Object.freeze({
  /** Sway at the crown, as a share of the tree's own height; a slow sine. */
  sway: Object.freeze({ amp: 0.04, speed: 1.1 }),
  /** Radians a second. */
  rotor: Object.freeze({ speed: 1.3 }),
  /** Cloth displacement at the free end, as a share of its length. */
  flag: Object.freeze({ amp: 0.22, speed: 3.1, wave: 7 }),
  /** Radians of slew either way, and how slowly. */
  crane: Object.freeze({ amp: 0.9, speed: 0.12 }),
  /** The airport's radar, in radians a second. A surveillance head turns about
   * once every five seconds, which at city zoom is a sweep you notice without
   * a spinning top on the skyline (T5b). */
  radar: Object.freeze({ speed: 1.2 }),
  /** Puffs a source, seconds for one to rise, and how far it goes, in tiles. */
  smoke: Object.freeze({ puffs: 6, period: 7, rise: 1.4, drift: 0.55, grow: 1.6, opacity: 0.6 }),
  /** A BUILDING ON FIRE is not a chimney (Q107, A114). The same column, denser
   * and more opaque: a fire is an event the player has to notice from the city
   * camera, and §9.4's restraint is about the city's resting tone rather than
   * about an emergency in it. The puff count and the opacity are compiled into
   * the shader, so a louder fire is a pool of its own rather than an argument —
   * which is also what keeps the chimney exactly as it was. */
  fire: Object.freeze({ puffs: 9, period: 7, rise: 1.4, drift: 0.55, grow: 1.6, opacity: 0.75 }),
  /** The water's swell (S18b): metres of rise and fall, radians a second, and
   * the wavelength in metres. A river seen from a bank moves slowly and barely
   * at all — 6 cm over a 26 m wave is the difference between a sheet of glass
   * and water, and anything more is a sea in a town. */
  ripple: Object.freeze({ amp: 0.06, speed: 0.55, wave: 26 }),
});

/** The pools that move, and how. A pool not listed here does not move. */
export const ANIMATED = Object.freeze({
  tree: "sway", rotor: "rotor", flag: "flag", crane: "crane", smoke: "smoke", fireSmoke: "fire",
  radar: "radar",
});

/** The clock the motion sees: zero whenever life is off, and never negative. */
export function motionTime(clock, { life = true } = {}) {
  return life && Number.isFinite(clock) && clock > 0 ? clock : 0;
}

/** A per-instance phase from where the instance stands, so neighbours differ. */
export function phaseOf(x, z) {
  return x * 1.7 + z * 2.3;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Horizontal sway at a height `h` (0 at the base, 1 at the crown), as a share
 * of the tree's height. Zero at t = 0 and at the base. */
export function sway(t, h, phase) {
  const k = clamp01(h);
  return MOTION.sway.amp * k * k * Math.sin(MOTION.sway.speed * t) * (0.6 + 0.4 * Math.cos(phase));
}

/** The rotor's angle. Zero at t = 0. */
export function rotorAngle(t, phase) {
  return MOTION.rotor.speed * t * (0.85 + 0.15 * Math.cos(phase));
}

/** The radar head's angle. Zero at t = 0, like the rotor's: the phase is a
 * MULTIPLIER rather than an offset, so a frozen frame is the rest pose and two
 * heads on two airports are not in lockstep. */
export function radarAngle(t, phase) {
  return MOTION.radar.speed * t * (0.9 + 0.1 * Math.cos(phase));
}

/** The crane's slew. Zero at t = 0. */
export function craneAngle(t, phase) {
  return MOTION.crane.amp * Math.sin(MOTION.crane.speed * t) * (0.7 + 0.3 * Math.cos(phase));
}

/** A flag's cloth at `u` along it (0 at the pole), as a share of its length. */
export function flagWave(t, u, phase) {
  const k = clamp01(u);
  return MOTION.flag.amp * k * Math.sin(MOTION.flag.speed * t - k * MOTION.flag.wave + phase);
}

/** Puff `k` of a smoke column: how far through its rise, and what that makes
 * it — lifted, drifted downwind, grown, and faded in then out. */
export function puff(t, k, spec = MOTION.smoke) {
  const { puffs, period, rise, drift, grow } = spec;
  const f = ((t / period + k / puffs) % 1 + 1) % 1;
  return {
    f,
    rise: f * rise,
    drift: f * drift,
    size: 0.5 + f * grow,
    alpha: (1 - f) * Math.min(1, f * 6),
  };
}

/**
 * The water's height at a point, in metres above its level (S18b).
 *
 * Two crossed waves rather than one, so a surface does not read as corrugated
 * iron from the air, and both are in WORLD metres so the swell does not change
 * size with the tile. `client/render/motion-material.js` mirrors this in GLSL —
 * the numbers come from `MOTION.ripple` in both, which is what keeps them one
 * rule rather than two.
 */
export function rippleAt(x, z, t) {
  const { amp, speed, wave } = MOTION.ripple;
  const k = (Math.PI * 2) / wave;
  // The TIME factor multiplies the whole field, so at `t = 0` the water is flat
  // — which is what `?life=0` has to mean here: every frozen screenshot this
  // project has taken keeps the surface S4 gave it, and a swell that is frozen
  // mid-wave would re-baseline all of them for nothing.
  const shape = (Math.sin(k * x) + Math.sin(k * (z * 0.8 + x * 0.3))) / 2;
  return amp * shape * Math.sin(speed * t);
}

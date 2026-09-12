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
  /** Puffs a source, seconds for one to rise, and how far it goes, in tiles. */
  smoke: Object.freeze({ puffs: 6, period: 7, rise: 1.4, drift: 0.55, grow: 1.6, opacity: 0.6 }),
});

/** The pools that move, and how. A pool not listed here does not move. */
export const ANIMATED = Object.freeze({
  tree: "sway", rotor: "rotor", flag: "flag", crane: "crane", smoke: "smoke",
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
export function puff(t, k) {
  const { puffs, period, rise, drift, grow } = MOTION.smoke;
  const f = ((t / period + k / puffs) % 1 + 1) % 1;
  return {
    f,
    rise: f * rise,
    drift: f * drift,
    size: 0.5 + f * grow,
    alpha: (1 - f) * Math.min(1, f * 6),
  };
}

// What a building's record says about how it looks (slice B2).
//
// "A building shows its level, its condition, its occupancy and its age." All
// four are already on the record and none of them reached a pixel: a brand-new
// hospital and a derelict one were the same box, and a city that had been
// burning for thirty years looked exactly like one that had not.
//
// Pure, monotone and in the world layer, because every one of these is a
// judgement about a number — "below 40 it is boarded" — and a judgement in a
// renderer is a judgement nobody can test. `params.js` calls this; the kit and
// the facade read the answer.
//
// Monotone is the invariant worth stating: a building that gets worse never
// gets a better-looking state out of this, at any level or age.

import { TICKS_PER_YEAR } from "../constants-mirror.js";

/** How long a building looks like a building site.
 *
 * Half a year. Long enough that a player who zones a block sees it happen and
 * short enough that a city is not a permanent construction yard — and it is in
 * TICKS because `builtTick` is, so this never has to ask what a month is. */
export const BUILDING_TICKS = Math.round(TICKS_PER_YEAR / 2);

/** Where condition stops being wear and starts being damage. Below `BOARDED` a
 * window or two goes blind; below `DERELICT` the garden goes with it. */
export const BOARDED = 40;
export const DERELICT = 20;

/** How much of the walls' colour is left at nothing-left condition.
 *
 * Not zero: a black building reads as a hole in the city, and the thing being
 * shown is grime, not absence. **0.72 rather than the 0.55 this started at**,
 * for a reason a screenshot and a gate agreed on: at 0.55 a derelict building
 * was near-black from the pavement, and `a11y_smoke`'s overlay-band check —
 * which measures the contrast between adjacent pollution bands in the darkest
 * twentieth of a shaded hillside — came back at 29 against its floor of 30.
 * Dirtying a city costs the overlays their readability, and the overlays are
 * what a colour-blind player reads the city with (ruling 041). */
export const GRIME = 0.72;

/**
 * The visual state of one building record.
 *
 * `tick` is the game clock — passed in, never read from a wall clock, because
 * the renderer is handed its time by the caller the way `client/life/` is.
 *
 * **With no tick at all the building is STANDING**, not new. The default has to
 * fail safe in that direction: a caller that forgets the clock would otherwise
 * turn every building in the city into a 10%-height shell with a scaffold round
 * it, which is the whole city broken, where the other way round costs one
 * building its first half-year of scaffolding.
 *
 * Returns:
 *   `phase`      — "site" while it is being built, "abandoned" when nobody owns
 *                  the zone under it any more, "standing" otherwise
 *   `progress`   — 0..1 through the build, for the shell's height
 *   `grime`      — 1 (clean) down to `GRIME`, multiplied into the wall colour
 *   `boarded`    — how many windows are blind, as a fraction
 *   `overgrown`  — true when the garden has gone
 *   `lit`        — the fraction of windows lit at night, from occupancy
 */
export function visualState(building, tick = undefined, capacity = 0) {
  const known = Number.isFinite(tick);
  const age = known ? Math.max(0, tick - (building.builtTick ?? 0)) : BUILDING_TICKS;
  const condition = clamp(building.condition ?? 100, 0, 100);
  const abandoned = building.zone === 0 && (building.def ?? "") === "";
  const phase = abandoned ? "abandoned" : age < BUILDING_TICKS ? "site" : "standing";
  return {
    phase,
    // A site starts at a QUARTER, not at nothing and not at a tenth: a
    // zero-height shell is an empty lot, and a tenth of a two-storey civic
    // building is under a metre — a bump in the grass rather than a building
    // going up. Measured in the first screenshot of one.
    progress: phase === "site" ? 0.25 + 0.75 * (age / BUILDING_TICKS) : 1,
    grime: abandoned ? GRIME : GRIME + (1 - GRIME) * (condition / 100),
    boarded: abandoned ? 1
      : condition >= BOARDED ? 0
        : Math.min(1, (BOARDED - condition) / BOARDED),
    overgrown: abandoned || condition < DERELICT,
    lit: abandoned ? 0 : litFraction(building, capacity),
  };
}

/** How much of a building is awake at night.
 *
 * `capacity` is what the record's `occupancy` is a share OF — a definition's
 * own capacity for a civic building, or the level's for a grown one. With none
 * given the answer is the third of windows E5 already lights, so this can never
 * make a city darker than it was before anyone asked the question. */
function litFraction(building, capacity) {
  if (!(capacity > 0)) return 1 / 3;
  const share = clamp((building.occupancy ?? 0) / capacity, 0, 1);
  // Never all of them and never none: a fully occupied block still has people
  // asleep, and an empty one still has a stairwell light on.
  return 0.1 + 0.75 * share;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Is this state worse than that one? The monotonicity the tests check: nothing
 * about getting older or emptier may make a building look better. */
export function looksWorse(a, b) {
  return a.grime < b.grime || a.boarded > b.boarded || (a.overgrown && !b.overgrown);
}

/** The visual state as a small integer, for the chunk hash (B2).
 *
 * A baked chunk has to rebake when a building's PICTURE changes — grime on the
 * walls, boards on the windows, a shell growing — and must not rebake when the
 * number behind it merely twitches. Condition and occupancy move most ticks,
 * so hashing them directly would rebake half the city every month.
 *
 * Quantised: five steps of build progress, eight of grime, four of boarding,
 * eight of lighting. A building rebakes its chunk a couple of dozen times over
 * its whole life, which is what a picture that changes ought to cost.
 */
export function visualKey(building, tick = undefined, capacity = 0) {
  const s = visualState(building, tick, capacity);
  const phase = s.phase === "site" ? 0 : s.phase === "abandoned" ? 2 : 1;
  const progress = Math.round(s.progress * 4);
  const grime = Math.round(((s.grime - GRIME) / (1 - GRIME)) * 7);
  const boarded = Math.round(s.boarded * 3);
  const lit = Math.round(s.lit * 7);
  return ((((phase * 5 + progress) * 8 + grime) * 4 + boarded) * 8) + lit;
}

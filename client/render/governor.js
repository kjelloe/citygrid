// The frame-time governor (slice V2, ruling 040).
//
// The triangle budget is enforced by measurement (ruling 019) and it measures
// the one thing three counts: triangles. A post pass, a shadow map and a
// supersample are fill rate, and `renderer.info.render.triangles` cannot see
// any of them — N30 measured the shadow pass at exactly zero triangles. On a
// phone those are most of the cost, so a Medium tier can meet its budget, miss
// its frame rate, and leave the budget gate green.
//
// So there are two instruments. This is the second one: it watches the clock
// and gives things up in a fixed order.
//
// Pure by construction — no `performance.now`, no globals, no DOM. Time enters
// only as the frame deltas the caller feeds in, which is what makes it
// testable and what makes a test able to compress a minute into a loop.

/** What is sacrificed, in order.
 *
 * Ink first: it is three full-screen passes and a depth read for a *finish*
 * (ruling 017 — a finish is the least of a style). Shadows next; they cost the
 * GPU real work and the picture survives without them. The supersample last,
 * because giving it up is the one the player reads as "blurry" rather than as
 * "different", and a blurry picture feels like a broken screen. */
export const SACRIFICE = ["ink", "shadows", "supersample"];

/** How long the frame time has to stay bad before anything is given up.
 *
 * A second, because everything shorter is something else: a garbage
 * collection, a chunk build, a tab regaining focus. Sacrificing a pass for one
 * of those makes the picture change style at random, which is worse than the
 * stall it was reacting to. */
const PATIENCE_MS = 1000;

/** Below this the percentile is arithmetic on noise, and the first frames of a
 * page are the slowest it will ever draw. */
const MIN_SAMPLES = 10;

export function createGovernor({ targetMs, window = 60, ladder = SACRIFICE } = {}) {
  // A ring, so a long session costs the same as a short one.
  const frames = new Float64Array(window);
  let count = 0;
  let cursor = 0;
  let overMs = 0;
  let given = 0;
  const sorted = new Float64Array(window);

  /** The 95th percentile of the window, not the mean. A mean is dominated by
   * the frames that were fine, and the whole complaint about a phone is the one
   * frame in twenty that hitches. */
  function p95() {
    if (count === 0) return 0;
    sorted.set(frames.subarray(0, count));
    const live = sorted.subarray(0, count).sort();
    return live[Math.min(count - 1, Math.floor(count * 0.95))];
  }

  return {
    /** One frame. `ms` is the delta the render loop measured. */
    sample(ms) {
      frames[cursor] = ms;
      cursor = (cursor + 1) % window;
      if (count < window) count += 1;

      // Enough samples to be worth a percentile, but not a full window: on a
      // phone drawing at 10 fps a 60-frame window is six seconds, and six
      // seconds of misery before the governor helps is most of the complaint.
      if (count < MIN_SAMPLES) return;

      if (p95() <= targetMs) {
        overMs = 0;
        return;
      }
      overMs += ms;
      if (overMs < PATIENCE_MS) return;
      overMs = 0;
      if (given < ladder.length) given += 1;
    },

    /** May this pass draw? */
    allows(name) {
      return ladder.indexOf(name) < 0 || ladder.indexOf(name) >= given;
    },

    /** What has been given up, in the order it went. */
    disabled() {
      return ladder.slice(0, given);
    },

    p95,
    size: () => count,

    /** A new tier is a new question, so the answers are thrown away. What is
     * NOT thrown away by anything else is deliberate: a governor that handed a
     * pass back as soon as the frames came good would oscillate for the whole
     * session, because the frames came good *because* of the sacrifice. */
    reset() {
      count = 0;
      cursor = 0;
      overMs = 0;
      given = 0;
      frames.fill(0);
    },
  };
}

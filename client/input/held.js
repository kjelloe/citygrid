// Held keys, as a rate (slice K2, ruling 042 §3).
//
// Until this slice an arrow key was one nudge per `keydown`: the camera moved
// in whatever steps the operating system's key-repeat happened to produce,
// which is a stutter on a slow repeat and a bolt on a fast one, and a different
// distance on every machine. The cluster's buttons had been a rate since K1;
// this is the same rate, reached from the keyboard, through the same intents.
//
// Pure, and here rather than in the controller, because a rate is exactly the
// kind of thing a test should be able to integrate twice at two different `dt`
// and get the same distance from. `controller.js` asks this what a key means
// and how far one frame of it goes.

import { PAN_SECONDS, TURN_PER_SECOND, ZOOM_PER_SECOND } from "../ui/camera-model.js";

/** What `Shift` does to a held camera key. Two, not five: it is a hurry-up, not
 * a second speed, and a player crossing a big map should still be able to stop
 * where they meant to (D6's 128×128 was the case that asked for it). */
export const FAST_MULTIPLIER = 2;

/** What a TAP is worth, in seconds of holding.
 *
 * A held key is a rate, and a rate applied for the few milliseconds between a
 * `keydown` and a `keyup` is zero: pressing an arrow once would move the camera
 * by nothing at all, which reads as a broken key rather than as a precise one.
 * So a press is worth this much holding up front, and holding continues from
 * there. About an eighth of a second — enough to see, small enough that a
 * player tapping their way across a map still gets there in a straight line. */
export const TAP_SECONDS = 0.12;

/** How long `Q` or `E` must be held before it stops being a snap.
 *
 * Ruling 006 as amended: the four comfortable angles are where Q, E and the
 * compass LAND, not where the camera is allowed to be. A tap still snaps one
 * step; a hold turns freely and lands back on the nearest angle when released,
 * so a player never has to know which of the two they asked for. 300 ms is
 * about the top of what reads as a tap. */
export const FREE_TURN_SECONDS = 0.3;

/** The keys that are HELD, and the camera button each one is.
 *
 * The pad's four directions carry a screen-space axis, which the camera table
 * cannot hold: `pan` is one button there with four keys, because it is one
 * intent. Everything else is a button id and nothing more.
 * `test/input.test.js` checks every id here exists and every key here is one
 * the camera table already claims, so the two cannot drift. */
export const HELD_KEYS = {
  ArrowUp: { id: "pan", axis: { x: 0, y: -1 } },
  ArrowDown: { id: "pan", axis: { x: 0, y: 1 } },
  ArrowLeft: { id: "pan", axis: { x: -1, y: 0 } },
  ArrowRight: { id: "pan", axis: { x: 1, y: 0 } },
  PageUp: { id: "tilt-up" },
  PageDown: { id: "tilt-down" },
  "+": { id: "zoom-in" },
  "=": { id: "zoom-in" },
  "-": { id: "zoom-out" },
  q: { id: "rotate-left" },
  e: { id: "rotate-right" },
};

/** The held key this event is, or `undefined`. Case-folded, because `Q` and `q`
 * are the same key and only one of them is in the table. */
export function heldFor(key) {
  if (typeof key !== "string") return undefined;
  return HELD_KEYS[key] ?? HELD_KEYS[key.toLowerCase()];
}

/** Tiles panned in one frame. `span` scales it: a pan that crosses the visible
 * view in `PAN_SECONDS` feels the same zoomed in and zoomed out, and a fixed
 * tiles-per-second would crawl across a whole map and race across a street. */
export function panStep(span, dt, fast = false) {
  return (span / PAN_SECONDS) * dt * (fast ? FAST_MULTIPLIER : 1);
}

/** Radians turned or tilted in one frame. */
export function turnStep(dt, fast = false) {
  return TURN_PER_SECOND * dt * (fast ? FAST_MULTIPLIER : 1);
}

/** The factor one frame of a held zoom multiplies `span` by. Exponential, so
 * holding for a second is the same ratio from any starting span — a linear zoom
 * is imperceptible when far out and violent when close in. */
export function zoomFactor(direction, dt, fast = false) {
  return Math.pow(2, direction * ZOOM_PER_SECOND * dt * (fast ? FAST_MULTIPLIER : 1));
}

/** Whether a `Q`/`E` press this long is still a snap, or has become a free turn. */
export function turnMode(elapsed) {
  return elapsed >= FREE_TURN_SECONDS ? "free" : "snap";
}

/** The nearest of the four comfortable angles, as a step index. Where a free
 * turn lands when the key comes up. */
export function nearestYawStep(yaw) {
  return Math.round(yaw / (Math.PI / 2));
}

// Where the city is, and how to frame it (slice K4).
//
// `Home` fitted the whole MAP: on a 128×128 with a town in one corner it zoomed
// out to a green rectangle with a smudge in it, which is a way of losing the
// city rather than finding it. What a player means by "take me back" is the
// part they have built.
//
// Pure, and in `client/world/` because it is arithmetic over state that a test
// can argue with — no three, no DOM, no clock (ruling 032). The controller
// applies the answer to the view; this only says what the answer is.

import { NET_PRESENT } from "../constants-mirror.js";

/** How much room to leave around the city, as a fraction of the span. A city
 * pressed against the edges of the frame reads as cut off. */
export const FIT_MARGIN = 1.15;

/** The smallest span a fit will choose. Fitting a single road tile would put
 * the camera in the street, which is not what a player asking to see the city
 * wants — and `MIN_SPAN` in the camera is what street mode is on the other side
 * of. */
export const FIT_MIN_SPAN = 12;

/**
 * The bounding box of everything the player has built, in tiles.
 *
 * Roads and buildings, not zoning: a painted district with nothing on it yet is
 * an intention, and a camera that frames intentions drifts away from the city
 * every time somebody paints ahead. Returns `undefined` for an untouched map,
 * so the caller can say "the whole map" rather than being handed a nonsense box.
 */
export function builtBounds(state) {
  const { width, height } = state;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const road = state.tiles.road;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((road[y * width + x] & NET_PRESENT) === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  for (const b of state.buildings) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w - 1 > maxX) maxX = b.x + b.w - 1;
    if (b.y + b.h - 1 > maxY) maxY = b.y + b.h - 1;
  }
  if (maxX < 0) return undefined;
  return { minX, minY, maxX, maxY };
}

/**
 * Where to put the camera to see the city, as `{ targetX, targetZ, span }`.
 *
 * An empty map fits the map, which is the only honest answer when there is
 * nothing to find. `span` is the LONGER side plus a margin, because the view is
 * square in tiles and the shorter side would leave half the city off screen.
 */
export function fitBounds(state) {
  const bounds = builtBounds(state);
  if (!bounds) {
    return {
      targetX: state.width / 2,
      targetZ: state.height / 2,
      span: Math.max(state.width, state.height) * FIT_MARGIN,
    };
  }
  const w = bounds.maxX - bounds.minX + 1;
  const h = bounds.maxY - bounds.minY + 1;
  return {
    // The centre of the box, not of the map: a town in one corner is what this
    // is for. `+ 0.5` puts the camera on the middle of the tile rather than on
    // its corner, the way `focusOn` expects.
    targetX: bounds.minX + w / 2,
    targetZ: bounds.minY + h / 2,
    span: Math.max(FIT_MIN_SPAN, Math.max(w, h) * FIT_MARGIN),
  };
}

/** Whether two views are the same place, within a tile and a tile of span.
 *
 * What "Home twice returns you" needs: floating point means the view a player
 * left is never bit-identical to the one they come back to, and a comparison
 * that demands it would make the second press do nothing on a machine and
 * everything on another. */
export function sameView(a, b, tolerance = 0.5) {
  if (!a || !b) return false;
  return Math.abs(a.targetX - b.targetX) < tolerance
    && Math.abs(a.targetZ - b.targetZ) < tolerance
    && Math.abs(a.span - b.span) < tolerance;
}

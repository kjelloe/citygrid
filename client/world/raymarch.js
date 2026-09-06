// Where a ray meets the ground (slice V4; ruling 038).
//
// Picking intersected a plane at `y = 0` from the first renderer, and on flat
// ground that is exact and free. With relief it is wrong in the direction that
// matters most: the ray carries on past the hillside it struck and lands
// further away, so clicking the near face of a hill builds on the far side of
// it. The error grows with the slope and with how far the camera is tilted —
// smallest where it gets tested, largest where the game is played.
//
// Pure: it is handed a ray and a height function and knows nothing about three,
// the camera or the grid. `picking.js` builds the ray and turns the answer back
// into tile coordinates.

import { getConfig } from "./config.js";

/**
 * Marches a ray until it crosses the height field, then bisects.
 *
 * Coarse steps and a bisection rather than fine steps throughout: the field is
 * continuous and mostly gentle, so a step of a tile finds the crossing in a
 * handful of samples and eight bisections then pin it to a centimetre. Stepping
 * finely from the start would cost twenty times as many `heightAt` calls for
 * the same answer, and `heightAt` is about a microsecond.
 *
 * Returns `{ x, y, z }` in metres, or `undefined` when the ray never meets the
 * ground — pointing at the sky, or running out above the hills. Never a guess:
 * a made-up point puts a building where the player did not click.
 */
export function marchGround(ray, heightAt, options = {}) {
  const cfg = getConfig();
  const step = options.step ?? cfg.tileM;
  const far = options.far ?? 100000;
  const { ox, oy, oz, dx, dy, dz } = ray;

  const above = (t) => (oy + dy * t) - heightAt(ox + dx * t, oz + dz * t);

  // Starting underground is not a pick. It happens when the camera is inside a
  // hill, and reporting the first crossing behind the eye would select a tile
  // the player cannot see.
  if (above(0) < 0) return undefined;

  // Skip to the band the ground is actually in.
  //
  // The camera sits 1,200 tiles out along its orbit ray so that an orthographic
  // frustum clears the map at every zoom, which is 24 km in metres. Marching
  // from there at a tile a step is over a thousand `heightAt` calls for a
  // pointer move, and picking runs on every hover. Given the field's extent the
  // whole search is the few steps between entering `yMax` and leaving `yMin`.
  let start = 0;
  let end = far;
  if (dy < -1e-9) {
    if (options.yMax !== undefined) start = Math.max(0, (oy - options.yMax) / -dy);
    if (options.yMin !== undefined) end = Math.min(far, (oy - options.yMin) / -dy);
  }
  if (start > end) return undefined;

  let previous = start;
  let t = start + step;
  while (t <= end) {
    if (above(t) <= 0) {
      // Crossed between `previous` and `t`. Bisect: eight halvings of a
      // twenty-metre step is eight centimetres, and the answer only has to be
      // good to a fraction of a tile.
      let lo = previous;
      let hi = t;
      for (let i = 0; i < 24 && hi - lo > 0.01; i += 1) {
        const mid = (lo + hi) / 2;
        if (above(mid) > 0) lo = mid;
        else hi = mid;
      }
      const at = (lo + hi) / 2;
      return { x: ox + dx * at, y: oy + dy * at, z: oz + dz * at, t: at };
    }
    previous = t;
    t += step;
  }
  // The band is crossed but the last step may have stopped just short of it.
  if (end > previous && above(end) <= 0) {
    let lo = previous;
    let hi = end;
    for (let i = 0; i < 24 && hi - lo > 0.01; i += 1) {
      const mid = (lo + hi) / 2;
      if (above(mid) > 0) lo = mid;
      else hi = mid;
    }
    const at = (lo + hi) / 2;
    return { x: ox + dx * at, y: oy + dy * at, z: oz + dz * at, t: at };
  }
  return undefined;
}

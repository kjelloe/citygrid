// Where the rain is (Q112, A115).
//
// The streaks are a column of instances around the EYE — rain is weather near
// the camera, not a thing that exists over the whole map — and where each one
// is, is arithmetic over a hash and the clock. Pure, in `client/world/`, so
// node can test the placement that three cannot be asked about: B6's pool drew
// 1,140 instances the frame counted and no camera ever saw, and the three
// defects found on the way were all placement (the centre of the visible
// bounds, which at a low pitch is past the map's edge; `eyeOf`, which for a
// city camera is twelve hundred units out along the orbit; and a ladder rung so
// early that the city frame gave the rain up before anything else).
//
// Everything here is in TILE units, which is what the instanced pools take.

import { jitter } from "./hash.js";

/** The column, in TILE units (Q112, A115).
 *
 * `count` is how many streaks exist at once — a curtain around the eye rather
 * than weather over the map, so the number is small and does not scale with the
 * city. `radius` and `height` are the column's size, `length` a streak's own,
 * `period` how long one takes to fall its height. At twelve hundred instances
 * of two triangles this was 2,280 of a 400,000-triangle frame and was still put
 * second on the LOD ladder, which is why the city gave it up first (B6).
 */
export const RAIN = Object.freeze({
  // In TILES, which is what the instanced pools take — and the first thing this
  // slice got wrong, because a streak written in metres is twenty times too big
  // and the first shot came back with ten-metre bars of rain over the city.
  count: 700, radius: 2, height: 0.8, length: 0.03, period: 0.55,
  // Three centimetres across. The first cut used the geometry's default half
  // width of 0.02 TILES — forty centimetres — and the picture was a sky full of
  // grey tiles, which is the same units mistake twice in one slice.
  width: 0.0015, colour: 0xd6e2ec, opacity: 0.55,
});

/** Is the rain DRAWN at all from this camera (Q112, A115)?
 *
 * On foot and in photo mode, yes: a streak is half a metre long and at eye
 * height that reads. From the air it does not — at eighteen pixels a tile a
 * raindrop is nothing, and what weather looks like from up there is the flat
 * grey light and the closer fog B6a already ships. So the city camera draws the
 * hour and not the streaks, which is the same reasoning the markings rung uses
 * and keeps 1,400 triangles out of a frame that cannot show them.
 */
export function rainsAt(view) {
  return view?.mode === "street" || view?.mode === "photo";
}

/** Where the column stands, in tiles.
 *
 * On foot it is the walker's own eye. From the air it is what the camera is
 * LOOKING at: a city camera's eye is out on an orbit — up to twelve hundred
 * tiles from the city — and B6 put the rain there once and at the centre of the
 * visible bounds (past the map's edge at a low pitch) once. Two invisible
 * curtains, neither of them visible as a defect from inside three.
 */
export function anchorFor(view, eye) {
  if (view.mode === "street" || view.mode === "photo") return { x: eye.x, y: eye.y, z: eye.z };
  return { x: view.targetX, y: view.groundY ?? 0, z: view.targetZ };
}

/** A streak's own fall, as a share of the column's height. */
function fall(t, k, spec) {
  // The phase has to be uncorrelated with the ANGLE or the column reads as a
  // spiral staircase of rain — which is what the second shot of this slice
  // shows. `jitter` walks in order for consecutive k, so this takes a second
  // irrational (the plastic number) rather than a hash: equidistributed, and
  // nothing to do with the golden angle the disc is laid out on.
  const f = ((t / spec.period + (k * 0.7548776662) % 1) % 1 + 1) % 1;
  return f;
}

/**
 * The streaks to draw this frame.
 *
 * `eye` is where the camera actually IS in tiles (not its target and not its
 * orbit anchor), `t` is seconds, and `spec` carries the column's size. The
 * column travels with the eye and is quantised to it, so a moving camera does
 * not drag a fixed curtain of rain behind it.
 */
export function streaksAround(eye, t, spec, out = []) {
  out.length = 0;
  if (!eye) return out;
  const { count, radius, height, length, period } = spec;
  for (let k = 0; k < count; k += 1) {
    // A Fibonacci disc rather than a hash: `jitter` is a multiplicative hash
    // with one xorshift, and for CONSECUTIVE k its high bits walk in order —
    // used as an angle it drew a spiral arm of rain across the sky, which the
    // first shot of this slice shows. The golden angle is even by construction
    // and needs no hash at all; the only thing that has to be scattered is the
    // phase of the fall, where order does not show.
    const a = k * 2.399963229728653;
    const r = Math.sqrt((k + 0.5) / count) * radius;
    const f = fall(t, k, { period });
    out.push({
      x: eye.x + Math.cos(a) * r,
      // From the top of the column to the ground, falling.
      y: eye.y + height * (1 - f) - length / 2,
      z: eye.z + Math.sin(a) * r,
      length,
      // A little lean, the same for every streak: rain falls in a wind.
      lean: spec.lean ?? 0,
    });
  }
  return out;
}

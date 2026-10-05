// Where a wall face is, and which way it runs.
//
// Pure geometry, in its own module because three things need it and one of them
// is drawn BY the facade builder: `facade.js` imports `house-parts.js`, which
// needed `EDGES` back, and a cycle is a cycle even when the module system
// tolerates it (the style rule: acyclic imports).

/** The four edges, as an outward normal and a direction along the wall. */
export const EDGES = [
  { side: 0, out: [0, -1], along: [1, 0] },   // north face, runs +x
  { side: 1, out: [1, 0], along: [0, 1] },    // east face, runs +z
  { side: 2, out: [0, 1], along: [-1, 0] },   // south face, runs -x
  { side: 3, out: [-1, 0], along: [0, -1] },  // west face, runs -z
];

/** Where an edge starts, in world metres: the corner it runs away from. */
export function originOf(spec, side) {
  if (side === 0) return [spec.x0, spec.z0];
  if (side === 1) return [spec.x1, spec.z0];
  if (side === 2) return [spec.x1, spec.z1];
  return [spec.x0, spec.z1];
}

/**
 * A quad on a wall face, wound to face OUT of it (S21).
 *
 * `corners` are the four points in the canonical order this file's readers all
 * build: (u0,y0), (u1,y0), (u1,y1), (u0,y1) — along the wall, then up it. The
 * outward winding is the top edge first, and it is the SAME on all four sides,
 * because `EDGES` is one handedness: `along` turns with `out`, so this order's
 * normal is `along × up`, which is the outward normal everywhere.
 *
 * It exists because three places built this quad and each chose between two
 * windings with `out[0] + out[1] > 0` — a test on the normal alone, right on
 * north and west and backwards on east and south. Every pane of glass, curtain,
 * blind, shop back, brick course, shutter and number plate on half of every
 * building in every city was wound inward, where the renderer culls it.
 */
export function outwardQuad(sink, corners) {
  sink.quad(corners[3], corners[2], corners[1], corners[0]);
}

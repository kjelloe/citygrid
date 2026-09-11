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

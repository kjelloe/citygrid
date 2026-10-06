// What makes a crossing read as a bridge (slice S18a).
//
// S13 built the deck: the carriageway stands `road.deckClearance` over the
// water and a girder hangs under its kerb, so a road no longer wades. What it
// has not got is the two things a bridge is recognised by from a bank — a
// PARAPET along each side and PIERS standing in the water — and the item has
// asked for both since Q145.
//
// Pure in `(points, levels, beds, cfg, halfWidth)`: the renderer samples the
// height field and the water, and the decision about where the parts go is
// here, where a test can hold it (ruling 032).

/** Tiles between piers. Every tile is a wall across the river; every four is a
 * span a girder of this depth would not hold. Two is the span a small concrete
 * bridge is built in, and at 20 m a tile that is 40 m. */
export const PIER_EVERY = 2;

/** How high a parapet stands above the deck, in metres — a wall somebody can
 * lean on, not a kerb and not a fence. */
const PARAPET_H = 1.1;

/** A pier's thickness, in metres. */
const PIER_W = 1.8;

/**
 * The parts of a crossing, in world metres.
 *
 * `levels[k]` is the water's level at point `k`, or `undefined` on dry land;
 * `beds[k]` is the ground under it. Returns `[]` where a run crosses no water
 * at all, which is most of a city's roads.
 */
export function bridgeParts(points, levels, beds, cfg, halfWidth) {
  const wet = [];
  for (let k = 0; k < points.length; k += 1) if (levels[k] !== undefined) wet.push(k);
  if (wet.length === 0) return [];

  const deckOf = (k) => levels[k] + cfg.road.deckClearance;
  // One point either side of the water, so the parapet lands on the bank
  // rather than stopping in mid-air at the abutment.
  const first = Math.max(0, wet[0] - 1);
  const last = Math.min(points.length - 1, wet[wet.length - 1] + 1);
  const out = [];

  // The two parapets, offset across the run. The direction along the line is
  // taken from the neighbouring points, so a curved crossing's rail follows it.
  for (const side of [-1, 1]) {
    const rail = [];
    for (let k = first; k <= last; k += 1) {
      const prev = points[Math.max(first, k - 1)];
      const next = points[Math.min(last, k + 1)];
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      // Perpendicular, at the kerb line.
      const nx = (-dz / len) * halfWidth * side;
      const nz = (dx / len) * halfWidth * side;
      const level = levels[k];
      const y = level === undefined
        ? (levels[wet[0]] !== undefined ? deckOf(wet[0]) : 0)
        : deckOf(k);
      rail.push({ x: points[k].x + nx, z: points[k].z + nz, y });
    }
    out.push({ kind: "parapet", side, height: PARAPET_H, points: rail });
  }

  // The piers: every `PIER_EVERY` tiles along the wet stretch, standing on the
  // bed and reaching the deck. None at all in a one-tile stream — a column in
  // a puddle is not a bridge, it is a bollard.
  const step = PIER_EVERY;
  for (let i = step; i < wet.length - 1; i += step) {
    const k = wet[i];
    out.push({
      kind: "pier",
      x: points[k].x,
      z: points[k].z,
      y0: beds[k],
      y1: deckOf(k),
      w: PIER_W,
    });
  }
  return out;
}

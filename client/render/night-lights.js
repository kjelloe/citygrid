// Which lamps actually light the street (slice E6; spec §7.3).
//
// A city at night has a thousand lamps and a GPU can afford eight. Union
// Square's answer is the one taken here: a capped set of point lights nearest
// the camera, and every other lamp is emissive geometry that glows without
// lighting anything. The choosing is arithmetic over positions, so it is pure
// and it is tested — a light pool that flickers as the player walks, or that
// hands the same lamp out twice, is exactly the kind of thing that looks like
// a driver bug from the inside.

/**
 * The `cap` lamps nearest `eye`, nearest first.
 *
 * `hysteresis` is what stops the pool churning. A lamp on the boundary of the
 * cap swaps in and out on alternate frames as the player walks, and a point
 * light appearing and vanishing at 60 Hz is a strobe: a lamp already in the
 * pool has to be beaten by this margin, in metres, before it is dropped.
 */
export function nearestLamps(lamps, eye, cap, held = [], hysteresis = 6) {
  if (cap <= 0 || !lamps || lamps.length === 0) return [];
  const heldIds = new Set(held.map((l) => l.id));
  const scored = lamps.map((lamp) => ({
    lamp,
    // Squared would be cheaper and wrong: the hysteresis is a distance.
    d: Math.hypot(lamp.x - eye.x, (lamp.y ?? 0) - (eye.y ?? 0), lamp.z - eye.z)
      - (heldIds.has(lamp.id) ? hysteresis : 0),
  }));
  scored.sort((a, b) => (a.d - b.d) || (a.lamp.id - b.lamp.id));
  return scored.slice(0, cap).map((s) => s.lamp);
}

/** Every lamp in a set of baked chunks, as one flat list. */
export function lampsOf(entries) {
  const out = [];
  for (const entry of entries) {
    for (const lamp of entry.lamps ?? []) out.push(lamp);
  }
  return out;
}

// What a civic building looks like, per definition (slice S1).
//
// Twelve catalogue definitions and, until this slice, six generic silhouettes
// picked by a hash of the id: a coal plant and a park were the same box with
// different windows in it, and the only thing that said which was the label on
// the build menu. A player cannot read a city whose power station looks like
// its hospital.
//
// **The shapes are here, not in the kit**, because the kit imports three and
// node cannot look at it — and because the L2 instanced box and the L3 baked
// facade have to agree about what a coal plant IS (E5's rule). Both read this.
//
// Every mass is in UNIT space: x and z in [-1, 1] across the lot's footprint,
// y in units of the lot's own height, so one description serves a 1×1 water
// tower and a 3×3 hospital. The renderer multiplies; nothing here knows a metre.

/** A mass: a box, or a cylinder when `round`. `shade` tints it against the
 * building's own colour the way the kit's parts already do. */
const box = (x0, y0, z0, x1, y1, z1, shade = 1, round = false) =>
  ({ x0, y0, z0, x1, y1, z1, shade, round });

/** The twelve, in the catalogue's own order.
 *
 * Each is a list of masses and a `tall` flag — the one thing the LOD cares
 * about, because a stack or a mast has to survive the silhouette pass that
 * flattens everything else (`TIER.BLOCK`). Read the shapes as elevations: the
 * first mass is the main volume and the rest sit on or beside it. */
export const CIVIC_SHAPES = Object.freeze({
  coalPlant: {
    tall: true,
    masses: [
      box(-1, 0, -0.55, 0.35, 0.62, 1, 1),              // turbine hall
      box(0.42, 0, -0.2, 0.78, 1.55, 0.16, 0.82),       // stack
      box(0.42, 0, 0.3, 0.78, 1.3, 0.66, 0.82),         // second stack
      box(-0.9, 0, -1, 0.2, 0.26, -0.62, 0.45),         // coal heap
    ],
  },
  gasPlant: {
    tall: true,
    masses: [
      box(-1, 0, -0.5, 0.3, 0.55, 1, 1),
      box(0.4, 0, -0.1, 0.72, 1.25, 0.22, 0.82),        // one stack
      box(-0.8, 0, -1, -0.3, 0.42, -0.55, 0.9, true),   // tank
      box(-0.1, 0, -1, 0.4, 0.42, -0.55, 0.9, true),    // tank
    ],
  },
  windTurbine: {
    tall: true,
    masses: [
      box(-0.12, 0, -0.12, 0.12, 2.2, 0.12, 1),         // mast
      box(-0.22, 2.2, -0.16, 0.22, 2.42, 0.16, 0.9),    // nacelle
      // The blades are three thin slabs; S6 turns them.
      box(-0.06, 2.42, -0.05, 0.06, 3.3, 0.05, 0.95),
      box(-0.85, 2.2, -0.05, -0.06, 2.32, 0.05, 0.95),
      box(0.06, 2.2, -0.05, 0.85, 2.32, 0.05, 0.95),
    ],
  },
  solarPlant: {
    tall: false,
    masses: [
      box(-0.86, 0, -0.86, 0.86, 0.06, 0.86, 0.5),      // the yard
      box(-0.9, 0.1, -0.8, 0.9, 0.3, -0.35, 0.35),      // panel row
      box(-0.9, 0.1, -0.2, 0.9, 0.3, 0.25, 0.35),
      box(-0.9, 0.1, 0.4, 0.9, 0.3, 0.85, 0.35),
      box(-0.25, 0, 0.86, 0.25, 0.34, 1, 0.9),          // the inverter hut
    ],
  },
  waterPump: {
    tall: false,
    masses: [
      box(-0.6, 0, -0.4, 0.6, 0.5, 0.5, 1),             // hut
      box(-0.9, 0, 0.5, 0.9, 0.12, 1, 0.7),             // pier out over the water
      box(-0.2, 0.5, -0.2, 0.2, 0.72, 0.2, 0.85),       // vent
    ],
  },
  groundwaterPump: {
    tall: false,
    masses: [
      box(-0.55, 0, -0.55, 0.35, 0.5, 0.45, 1),         // hut
      box(0.42, 0, -0.3, 0.85, 0.85, 0.13, 0.9, true),  // tank
    ],
  },
  waterTreatment: {
    tall: false,
    masses: [
      box(-1, 0, -1, -0.1, 0.45, -0.1, 1),              // control building
      box(0.05, 0, -0.95, 0.95, 0.3, -0.05, 0.75, true),  // round tank
      box(0.05, 0, 0.1, 0.95, 0.3, 1, 0.75, true),        // round tank
      box(-0.95, 0, 0.1, -0.05, 0.3, 1, 0.75, true),      // round tank
    ],
  },
  waterTower: {
    tall: true,
    masses: [
      box(-0.55, 0.95, -0.55, 0.55, 1.6, 0.55, 1, true),  // the tank
      box(-0.62, 1.55, -0.62, 0.62, 1.7, 0.62, 0.85),     // its lid
      box(-0.45, 0, -0.45, -0.28, 0.98, -0.28, 0.8),      // four legs
      box(0.28, 0, -0.45, 0.45, 0.98, -0.28, 0.8),
      box(-0.45, 0, 0.28, -0.28, 0.98, 0.45, 0.8),
      box(0.28, 0, 0.28, 0.45, 0.98, 0.45, 0.8),
    ],
  },
  fireStation: {
    tall: true,
    masses: [
      box(-1, 0, -0.7, 1, 0.5, 0.8, 1),                 // appliance bay
      box(-0.85, 0.02, 0.8, -0.15, 0.42, 0.88, 0.3),    // the red doors
      box(0.15, 0.02, 0.8, 0.85, 0.42, 0.88, 0.3),
      box(0.55, 0, -1, 0.95, 1.35, -0.62, 0.9),         // drill tower
    ],
  },
  policeStation: {
    tall: false,
    masses: [
      box(-1, 0, -0.6, 0.45, 0.62, 0.9, 1),             // the station
      box(0.5, 0, -0.6, 0.86, 0.12, 0.86, 0.55),        // the yard
      box(-0.2, 0.62, 0.6, 0.2, 0.78, 0.9, 0.35),       // the lamp over the door
    ],
  },
  hospital: {
    tall: true,
    masses: [
      box(-1, 0, -0.9, 1, 1.15, 0.5, 1),                // the ward block
      box(-0.55, 0, 0.5, 0.55, 0.35, 1, 0.92),          // the entrance canopy
      box(-0.08, 1.15, -0.5, 0.08, 1.32, 0.1, 0.3),     // the cross, upright
      box(-0.3, 1.21, -0.5, 0.3, 1.27, 0.1, 0.3),       // the cross, across
    ],
  },
  park: {
    // No building (S1's own words). The lawn and its path; S5 puts the benches
    // and the trees on it.
    //
    // **The lawn is not a LID.** At the full lot it covered every ground pixel
    // of its tile, and an overlay is a texture on the ground (ruling 041) — so
    // a park showed no pollution, no land value and no coverage at all, and
    // `a11y_smoke`'s band-separation check felt it. Pulled in, the terrain and
    // its wash run round the edge of the grass.
    tall: false,
    masses: [
      box(-0.84, 0, -0.84, 0.84, 0.04, 0.84, 0.45),
      box(-0.1, 0.04, -0.84, 0.1, 0.06, 0.84, 0.8),
    ],
  },
});

/** The definitions, in one fixed order, so an index is a stable identity.
 *
 * The instanced pass keys its pools `civic<n>`, so `n` has to mean the same
 * thing in the pool builder and in the placer — this is the one list both read
 * (the `VARIANTS` lesson from V6, which cost every building of a missing
 * variant).
 *
 * The keys of the table above ARE the list: `client/world/` may not import
 * `engine/` (ruling 032), so the alternative was a second copy of twelve
 * strings. `test/civic-spec.test.js` compares this against `definitionIds()`
 * and fails when the catalogue grows a definition this file has no shape for —
 * which is the drift a mirror is supposed to make loud. Sorted, because
 * `definitionIds()` is. */
export const CIVIC_DEFS = Object.freeze(Object.keys(CIVIC_SHAPES).sort());

/** Which pool a civic building belongs in. Unknown definitions — a mod, a
 * catalogue that grew — fall back to the first shape rather than to nothing:
 * `pools[undefined]` is how a whole category stops being drawn. */
export function civicVariant(def) {
  const at = CIVIC_DEFS.indexOf(def);
  return at < 0 ? 0 : at;
}

/** The shape for a definition, by name or by index. */
export function civicShape(def) {
  const name = typeof def === "number" ? CIVIC_DEFS[def] : def;
  return CIVIC_SHAPES[name] ?? CIVIC_SHAPES[CIVIC_DEFS[0]];
}

/** How tall the shape reaches, in lot-height units. The LOD's silhouette pass
 * flattens a building to a block; a stack or a mast that is flattened to its
 * hall's height stops being a power station from the air, so the block form
 * reads this rather than assuming 1. */
export function civicHeight(def) {
  const shape = civicShape(def);
  let top = 0;
  for (const m of shape.masses) top = Math.max(top, m.y1);
  return top;
}

/** How far to turn a shape so its front faces the street, in quarter turns.
 *
 * The masses are authored with the entrance on +z — the south face, side 2 —
 * because one of the four had to be chosen. A lot whose frontage is elsewhere
 * turns: a hospital photographed from the north showed a blank ward wall,
 * because its canopy and its cross were on the side away from the road.
 *
 * Here rather than in either renderer so the instanced box and the baked
 * facade turn by the same amount (E5).
 */
export function civicSpin(frontage) {
  return (((frontage ?? 2) - 2) % 4 + 4) % 4;
}

/** A mass rotated into the lot's frame, still in unit space. */
export function turnMass(m, quarters) {
  let out = { ...m };
  for (let i = 0; i < ((quarters % 4) + 4) % 4; i += 1) {
    // A quarter turn about the lot's centre: (x, z) -> (-z, x).
    out = { ...out, x0: -out.z1, x1: -out.z0, z0: out.x0, z1: out.x1 };
  }
  return out;
}

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

/** The materials a civic mass can be made of (slice S1b).
 *
 * The review after S1: every mass of every definition was one concrete tone, so
 * a coal plant's stacks and a hospital's ward were the same grey as each other
 * and as the wall they stood on, and from the pavement they read as warehouses.
 * A small named set, not a colour per mass — the painted style keeps its ramps
 * and every style resolves the same seven names its own way. */
export const MATERIALS = Object.freeze([
  "brick", "concrete", "steel", "white", "red", "glass", "tank", "dark",
  // A park's grass. It is a material rather than a shade of the building,
  // because a green baked into a building's own colour can only ever be a
  // shade of that colour — the same argument the garden pool won in V6.
  "lawn",
]);

/** A mass: a box, or a cylinder when `round`. `shade` tints it against the
 * building's own colour the way the kit's parts already do; `mat` names what it
 * is made of, and the renderer resolves that per style. */
const box = (x0, y0, z0, x1, y1, z1, mat = "concrete", round = false, shade = 1) =>
  ({ x0, y0, z0, x1, y1, z1, shade, round, mat });

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
      box(-1, 0, -0.55, 0.35, 0.62, 1, "brick"),            // turbine hall
      // The stacks are DRUMS and stand proud of the hall by more than its own
      // height: the thing that says "power station" from across a river has to
      // be the thing you can see from there (S1b).
      box(0.4, 0, -0.26, 0.82, 1.85, 0.16, "steel", true),
      box(0.4, 0, 0.28, 0.82, 1.5, 0.7, "steel", true),
      box(-0.9, 0, -1, 0.2, 0.26, -0.62, "dark"),           // coal heap
      box(-1, 0.62, -0.55, 0.35, 0.68, 1, "dark"),          // the hall's roof
    ],
    // Where the smoke comes out (S6): the tops of the two stacks.
    emits: [{ x: 0.61, y: 1.85, z: -0.05 }, { x: 0.61, y: 1.5, z: 0.49 }],
  },
  gasPlant: {
    tall: true,
    masses: [
      box(-1, 0, -0.5, 0.3, 0.55, 1, "brick"),
      box(0.38, 0, -0.14, 0.76, 1.45, 0.24, "steel", true), // one stack
      box(-0.8, 0, -1, -0.3, 0.42, -0.55, "tank", true),
      box(-0.1, 0, -1, 0.4, 0.42, -0.55, "tank", true),
      box(-1, 0.55, -0.5, 0.3, 0.6, 1, "dark"),
    ],
    emits: [{ x: 0.57, y: 1.45, z: 0.05 }],
  },
  windTurbine: {
    tall: true,
    masses: [
      box(-0.1, 0, -0.1, 0.1, 2.2, 0.1, "white", true),     // mast
      // The nacelle is the machine, not the tower: steel against the white mast
      // is what stops a turbine being one undifferentiated white stick.
      box(-0.22, 2.2, -0.16, 0.22, 2.42, 0.16, "steel"),    // nacelle
      // The three blades are the ROTOR (S6): neither the instanced turbine nor
      // the baked one draws them; a rotor pool turns in their place, about
      // `hub`, at every zoom.
      { ...box(-0.06, 2.42, -0.05, 0.06, 3.3, 0.05, "white"), rotor: true },
      { ...box(-0.85, 2.2, -0.05, -0.06, 2.32, 0.05, "white"), rotor: true },
      { ...box(0.06, 2.2, -0.05, 0.85, 2.32, 0.05, "white"), rotor: true },
    ],
    hub: { x: 0, y: 2.31, z: 0 },
  },
  solarPlant: {
    tall: false,
    masses: [
      box(-0.86, 0, -0.86, 0.86, 0.06, 0.86, "concrete"),   // the yard
      box(-0.9, 0.1, -0.8, 0.9, 0.3, -0.35, "glass"),       // panel rows
      box(-0.9, 0.1, -0.2, 0.9, 0.3, 0.25, "glass"),
      box(-0.9, 0.1, 0.4, 0.9, 0.3, 0.85, "glass"),
      box(-0.25, 0, 0.86, 0.25, 0.34, 1, "white"),          // the inverter hut
    ],
  },
  waterPump: {
    tall: false,
    masses: [
      box(-0.6, 0, -0.4, 0.6, 0.5, 0.5, "brick"),           // hut
      box(-0.9, 0, 0.5, 0.9, 0.12, 1, "concrete"),          // pier
      box(-0.6, 0.5, -0.4, 0.6, 0.56, 0.5, "dark"),         // its roof
      box(-0.2, 0.56, -0.2, 0.2, 0.78, 0.2, "steel"),       // vent
    ],
  },
  groundwaterPump: {
    tall: false,
    masses: [
      box(-0.55, 0, -0.55, 0.35, 0.5, 0.45, "brick"),       // hut
      box(-0.55, 0.5, -0.55, 0.35, 0.56, 0.45, "dark"),
      box(0.42, 0, -0.3, 0.85, 0.9, 0.13, "tank", true),    // tank
    ],
  },
  waterTreatment: {
    tall: false,
    masses: [
      box(-1, 0, -1, -0.1, 0.45, -0.1, "brick"),            // control building
      box(-1, 0.45, -1, -0.1, 0.5, -0.1, "dark"),
      box(0.05, 0, -0.95, 0.95, 0.32, -0.05, "tank", true),
      box(0.05, 0, 0.1, 0.95, 0.32, 1, "tank", true),
      box(-0.95, 0, 0.1, -0.05, 0.32, 1, "tank", true),
    ],
  },
  waterTower: {
    tall: true,
    masses: [
      box(-0.55, 0.95, -0.55, 0.55, 1.6, 0.55, "tank", true),  // the tank
      box(-0.62, 1.55, -0.62, 0.62, 1.72, 0.62, "steel"),      // its lid
      box(-0.45, 0, -0.45, -0.28, 0.98, -0.28, "concrete"),    // four legs
      box(0.28, 0, -0.45, 0.45, 0.98, -0.28, "concrete"),
      box(-0.45, 0, 0.28, -0.28, 0.98, 0.45, "concrete"),
      box(0.28, 0, 0.28, 0.45, 0.98, 0.45, "concrete"),
    ],
  },
  fireStation: {
    // A flag on the roof (S6): a public service flies one.
    flag: true,
    tall: true,
    masses: [
      box(-1, 0, -0.7, 1, 0.5, 0.8, "brick"),               // appliance bay
      box(-1, 0.5, -0.7, 1, 0.56, 0.8, "dark"),
      // The doors are the thing that says fire station, so they are the height
      // of the bay and half its width, in red (S1b).
      box(-0.88, 0.02, 0.8, -0.12, 0.46, 0.9, "red"),
      box(0.12, 0.02, 0.8, 0.88, 0.46, 0.9, "red"),
      box(0.55, 0, -1, 0.95, 1.45, -0.62, "brick"),         // drill tower
    ],
  },
  policeStation: {
    // A flag on the roof (S6): a public service flies one.
    flag: true,
    tall: false,
    masses: [
      box(-1, 0, -0.6, 0.45, 0.62, 0.9, "brick"),           // the station
      box(-1, 0.62, -0.6, 0.45, 0.68, 0.9, "dark"),
      box(0.5, 0, -0.6, 0.86, 0.12, 0.86, "concrete"),      // the yard
      box(-0.26, 0.62, 0.62, 0.26, 0.92, 0.9, "glass"),     // the lamp over the door
    ],
  },
  hospital: {
    // A flag on the roof (S6): a public service flies one.
    flag: true,
    tall: true,
    masses: [
      box(-1, 0, -0.9, 1, 1.15, 0.5, "white"),              // the ward block
      box(-1, 1.15, -0.9, 1, 1.21, 0.5, "dark"),
      box(-0.55, 0, 0.5, 0.55, 0.4, 1, "glass"),            // the entrance
      // A cross on the STREET FACE. Sized in the LOT's units, which on a 3×3
      // hospital is 30 m to the unit — the first version was 0.36 wide and came
      // out a 21 m plus sign lying across the whole frontage. About a metre
      // thick and two storeys tall is 0.05 and 0.45 here.
      box(-0.05, 0.55, 0.46, 0.05, 1.05, 0.56, "red"),
      box(-0.2, 0.73, 0.46, 0.2, 0.87, 0.56, "red"),
    ],
  },
  park: {
    // No building (S1's own words). The lawn and its path; S5 puts the benches
    // and the trees on it.
    //
    // **The lawn is not a LID.** At the full lot it covered every ground pixel
    // of its tile, and an overlay is a texture on the ground (ruling 041) — so
    // a park showed no pollution, no land value and no coverage at all.
    tall: false,
    masses: [
      box(-0.84, 0, -0.84, 0.84, 0.04, 0.84, "lawn"),
      box(-0.1, 0.04, -0.84, 0.1, 0.06, 0.84, "concrete"),
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

/**
 * Where a point of a civic shape lands on a BAKED lot, in metres (S6).
 *
 * The street builder's own frame, not the instanced kit's: across the lot's
 * rectangle, turned for the frontage by `turnMass`'s quarter turn, and up from
 * the seat by one wall-height a unit — exactly how `buildCivic` places the
 * masses, so a rotor sits on its nacelle and smoke leaves its stack. `turn` is
 * the rotation to give anything posed there, and `scale` the lot's half-width,
 * the length a unit across is worth.
 */
export function civicPointOnLot(lot, params, point) {
  const quarters = ((civicSpin(lot.frontage) % 4) + 4) % 4;
  let x = point.x;
  let z = point.z;
  for (let i = 0; i < quarters; i += 1) {
    const nx = -z;
    z = x;
    x = nx;
  }
  const progress = params.state?.progress ?? 1;
  const storeys = lot.storeys ?? params.storeys ?? 1;
  const height = (params.groundH + (storeys - 1) * params.floorH) * progress;
  const hx = (lot.x1 - lot.x0) / 2;
  const hz = (lot.z1 - lot.z0) / 2;
  return {
    x: (lot.x0 + lot.x1) / 2 + x * hx,
    y: lot.seat + point.y * height,
    z: (lot.z0 + lot.z1) / 2 + z * hz,
    // `turnMass` turns (x, z) to (-z, x): a quarter the OTHER way from three's
    // rotation about y, so the pose is turned by minus the quarters.
    turn: -quarters * (Math.PI / 2),
    scale: hx,
  };
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

/** Which materials a definition is made of. A definition that came out a single
 * material is the S1 defect — one concrete tone for every mass — so
 * `test/civic-spec.test.js` refuses it. */
export function materialsOf(def) {
  return [...new Set(civicShape(def).masses.map((m) => m.mat))];
}

/** The name on a civic building's sign when nobody has supplied a localised one.
 *
 * `coalPlant` → `Coal plant`. A FUNCTION rather than a mirror of the catalogue's
 * twelve names: the game resolves the definition through `buildingLabelKey` and
 * passes the answer in through the renderer's options, and this is what a
 * screenshot harness — which has no catalogue loaded — gets instead. A mirror
 * would be a third copy of the same list, and the second copy is already what
 * `test/civic-spec.test.js` has to guard.
 *
 * (The first draft of this comment quoted the lookup with its quotes intact,
 * and `test/hud.test.js` scanned it as a real key and asked both catalogues for
 * `building.<def>` — a purity check reads source text, and source text includes
 * prose.)
 */
export function defaultName(def) {
  const words = String(def ?? "").replace(/([A-Z])/g, " $1").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** How light or dark a material is, for the INSTANCED box (slice S1b).
 *
 * The baked facade resolves a material to a palette colour per style; the
 * instanced pass has one colour per pool and shades per vertex, so at city zoom
 * a material is a multiplier on the building's own tone. Without it the box is
 * one flat colour — which is what happened the moment the shape table stopped
 * carrying numeric shades: every mass of every definition came out identical,
 * and a coal plant was a grey lump again at the zoom most of the city is seen
 * from.
 */
export const MATERIAL_SHADE = Object.freeze({
  brick: 0.92, concrete: 1, steel: 0.78, white: 1.12, red: 0.66,
  glass: 0.45, tank: 0.88, dark: 0.5, lawn: 0.62,
});

export function shadeOf(mat) {
  return MATERIAL_SHADE[mat] ?? 1;
}

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

import { jitter } from "./hash.js";
import { BANDS } from "./airfield.js";

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
 * first mass is the main volume and the rest sit on or beside it.
 *
 * **`pull`** is how many people this building's door draws onto the pavement
 * outside it (B10, Q146). It is here rather than derived because the engine has
 * no such number: `occupancy` is RESIDENTS and every civic building in a played
 * city has none, so a pavement outside a school asked for nobody and neither
 * crowd could put a person on it. A utility pulls 0 — nobody strolls past a
 * pump — and `test/civic-spec.test.js` refuses a definition that does not say,
 * so a new building cannot inherit a silent zero. */
export const CIVIC_SHAPES = Object.freeze({
  coalPlant: {
    pull: 0,
    tall: true,
    masses: [
      box(-1, 0, -0.55, 0.35, 0.62, 1, "brick"),            // turbine hall
      // The stacks are DRUMS and stand proud of the hall by more than its own
      // height: the thing that says "power station" from across a river has to
      // be the thing you can see from there (S1b). ON the hall's roof (R5):
      // beside it, from the pavement, a drum is a silo.
      box(-0.5, 0.68, -0.35, -0.08, 1.85, 0.07, "steel", true),
      box(-0.5, 0.68, 0.2, -0.08, 1.5, 0.62, "steel", true),
      box(-0.9, 0, -1, 0.2, 0.26, -0.62, "dark"),           // coal heap
      box(-1, 0.62, -0.55, 0.35, 0.68, 1, "dark"),          // the hall's roof
    ],
    // Where the smoke comes out (S6): the tops of the two stacks.
    emits: [{ x: -0.29, y: 1.85, z: -0.14 }, { x: -0.29, y: 1.5, z: 0.41 }],
  },
  gasPlant: {
    pull: 0,
    tall: true,
    masses: [
      box(-1, 0, -0.5, 0.3, 0.55, 1, "brick"),
      box(-0.55, 0.6, 0.1, -0.17, 1.45, 0.48, "steel", true), // one stack, on the roof (R5)
      box(-0.8, 0, -1, -0.3, 0.42, -0.55, "tank", true),
      box(-0.1, 0, -1, 0.4, 0.42, -0.55, "tank", true),
      box(-1, 0.55, -0.5, 0.3, 0.6, 1, "dark"),
    ],
    emits: [{ x: -0.36, y: 1.45, z: 0.29 }],
  },
  windTurbine: {
    pull: 0,
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
    pull: 0,
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
    pull: 0,
    tall: false,
    masses: [
      box(-0.6, 0, -0.4, 0.6, 0.5, 0.5, "brick"),           // hut
      box(-0.9, 0, 0.5, 0.9, 0.12, 1, "concrete"),          // pier
      box(-0.6, 0.5, -0.4, 0.6, 0.56, 0.5, "dark"),         // its roof
      box(-0.2, 0.56, -0.2, 0.2, 0.78, 0.2, "steel"),       // vent
    ],
  },
  groundwaterPump: {
    pull: 0,
    tall: false,
    masses: [
      box(-0.55, 0, -0.55, 0.35, 0.5, 0.45, "brick"),       // hut
      box(-0.55, 0.5, -0.55, 0.35, 0.56, 0.45, "dark"),
      box(0.42, 0, -0.3, 0.85, 0.9, 0.13, "tank", true),    // tank
    ],
  },
  waterTreatment: {
    pull: 0,
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
    pull: 0,
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
    pull: 1,
    // A flag on the roof (S6): a public service flies one.
    flag: true,
    tall: true,
    masses: [
      // Tall enough over the doors for the name board to sit above them (R5).
      box(-1, 0, -0.7, 1, 0.62, 0.8, "brick"),              // appliance bay
      box(-1, 0.62, -0.7, 1, 0.68, 0.8, "dark"),
      // The doors are the thing that says fire station, so they are the height
      // of the bay and half its width, in red (S1b).
      box(-0.88, 0.02, 0.8, -0.12, 0.46, 0.9, "red"),
      box(0.12, 0.02, 0.8, 0.88, 0.46, 0.9, "red"),
      box(0.55, 0, -1, 0.95, 1.45, -0.62, "brick"),         // drill tower
    ],
  },
  policeStation: {
    pull: 2,
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
    pull: 6,
    // A flag on the roof (S6): a public service flies one.
    flag: true,
    tall: true,
    masses: [
      box(-1, 0, -0.9, 1, 1.15, 0.5, "white"),              // the ward block
      box(-1, 1.15, -0.9, 1, 1.21, 0.5, "dark"),
      // The entrance: a glazed bay ONE bay wide (R5). It was 1.1 of the unit —
      // on a 3×3 hospital a 33 m strip of dark glass along the whole front.
      box(-0.08, 0, 0.5, 0.08, 0.35, 0.76, "glass"),
      // A cross on the STREET FACE. Sized in the LOT's units, which on a 3×3
      // hospital is 30 m to the unit — the first version was 0.36 wide and came
      // out a 21 m plus sign lying across the whole frontage. About a metre
      // thick and two storeys tall is 0.05 and 0.45 here.
      box(-0.05, 0.55, 0.46, 0.05, 1.05, 0.56, "red"),
      box(-0.2, 0.73, 0.46, 0.2, 0.87, 0.56, "red"),
    ],
  },
  // The station (T2). An L2 silhouette only: a hall with a clock face on the
  // street side, and a platform under a canopy on the rail side, so it reads
  // as a station from the air and from a distance. T3 builds the real kit
  // through the baker — the platform, the footbridge and the clock — and this
  // is what has to agree with it (the L2/L3 rule, E5).
  railStation: {
    pull: 8,
    tall: false,
    masses: [
      // The hall, along the street half of a 3×2 lot. MIRRORED in z at S19:
      // the masses are authored with the entrance on +z (`civicSpin` turns that
      // face to the street), and this definition had its entrance on -z and its
      // platform on +z — so every station in the game showed the street its
      // platform canopy and put its door round the back. The close frame is
      // what found it.
      box(-0.92, 0, 0.05, 0.92, 0.55, 0.85, "brick"),
      box(-0.96, 0.55, 0.02, 0.96, 0.63, 0.9, "dark"),
      // The entrance, and the clock over it — the part that says "station"
      // rather than "long shed". S19 gave both the detail the close frame
      // showed missing: a surround round the doorway, so it is a door and not a
      // darker patch of brick, and a FACE on the clock.
      box(-0.22, 0, 0.82, 0.22, 0.4, 0.95, "glass"),
      box(-0.28, 0, 0.84, -0.2, 0.46, 0.97, "white"),
      box(0.2, 0, 0.84, 0.28, 0.46, 0.97, "white"),
      box(-0.28, 0.42, 0.84, 0.28, 0.5, 0.97, "white"),
      box(-0.12, 0.66, -0.06, 0.12, 0.9, 0.06, "dark", true),
      box(-0.09, 0.7, 0.06, 0.09, 0.86, 0.09, "white", true),
      box(-0.09, 0.7, -0.09, 0.09, 0.86, -0.06, "white", true),
      // The platform, and its canopy on four legs.
      box(-0.92, 0, -0.9, 0.92, 0.07, -0.05, "concrete"),
      box(-0.88, 0.52, -0.88, 0.88, 0.58, -0.1, "steel"),
      box(-0.84, 0.07, -0.22, -0.76, 0.52, -0.14, "steel"),
      box(0.76, 0.07, -0.22, 0.84, 0.52, -0.14, "steel"),
    ],
  },
  // The water (T4). None of these knows WHICH side its body is on — a shape is
  // in lot units and the lot does not carry a shore — so each is built round
  // its own axis and reads from any side: a jetty that runs both ways, a
  // canopy across the whole front, a crane over the middle of the quay.
  marina: {
    pull: 2,
    tall: false,
    masses: [
      // The clubhouse, in one corner, and its deck.
      box(-0.9, 0, -0.9, -0.1, 0.5, -0.2, "white"),
      box(-0.95, 0.5, -0.95, -0.05, 0.58, -0.15, "dark"),
      box(-0.75, 0, -0.85, -0.25, 0.35, -0.78, "glass"),
      // The pontoon, out across the lot, with two fingers off it.
      box(-0.9, 0, 0.1, 0.9, 0.09, 0.28, "concrete"),
      box(-0.55, 0, 0.28, -0.45, 0.09, 0.92, "concrete"),
      box(0.45, 0, 0.28, 0.55, 0.09, 0.92, "concrete"),
      // A mast, so a marina is not a shed with a path (the recognising part).
      box(-0.04, 0.09, 0.55, 0.04, 1.15, 0.63, "steel", true),
    ],
  },
  ferryTerminal: {
    pull: 4,
    tall: false,
    masses: [
      box(-0.85, 0, -0.9, 0.85, 0.62, 0.05, "white"),
      box(-0.92, 0.62, -0.95, 0.92, 0.7, 0.1, "dark"),
      // The waiting hall is glazed along its front, and the canopy reaches
      // out over the quay on posts.
      box(-0.7, 0.08, -0.95, 0.7, 0.5, -0.86, "glass"),
      box(-0.9, 0.55, 0.05, 0.9, 0.62, 0.8, "steel"),
      box(-0.82, 0.09, 0.7, -0.72, 0.55, 0.8, "steel"),
      box(0.72, 0.09, 0.7, 0.82, 0.55, 0.8, "steel"),
      box(-0.95, 0, 0.8, 0.95, 0.09, 0.95, "concrete"),
      // The ramp down to the water (S19): the part that says "ferry" rather
      // than "hall with a canopy". Two steps rather than a slope, because a
      // mass is a box — and a box at the quay's edge reads as the ramp a car
      // drives down.
      box(-0.45, 0, 0.9, 0.45, 0.06, 0.98, "concrete"),
      box(-0.3, 0, 0.95, 0.3, 0.03, 1, "concrete"),
    ],
  },
  freightPort: {
    pull: 1,
    // A crane is a mast: it has to survive the silhouette pass that flattens
    // everything else, or a port reads as a warehouse.
    tall: true,
    masses: [
      box(-0.95, 0, -0.85, 0.35, 0.55, 0.3, "brick"),
      box(-0.98, 0.55, -0.88, 0.38, 0.62, 0.33, "dark"),
      // The quay, and containers stacked on it.
      box(-0.98, 0, 0.35, 0.98, 0.07, 0.95, "concrete"),
      box(-0.8, 0.07, 0.45, -0.45, 0.3, 0.75, "red"),
      box(-0.4, 0.07, 0.45, -0.05, 0.3, 0.75, "steel"),
      box(-0.78, 0.3, 0.47, -0.47, 0.5, 0.73, "steel"),
      // The crane: two legs, a tower and a jib out over the water.
      box(0.45, 0.07, 0.42, 0.55, 1.25, 0.52, "red", true),
      box(0.78, 0.07, 0.42, 0.88, 1.25, 0.52, "red", true),
      box(0.42, 1.25, 0.4, 0.92, 1.42, 0.55, "red"),
      box(0.5, 1.28, 0.55, 0.62, 1.38, 0.98, "steel"),
    ],
  },
  // The top of the progression (T5). Both are L2 silhouettes: the shapes that
  // have to read from the air and from a distance. T5b bakes what only reads
  // close up — the runway and taxiway ribbons with their markings, the apron
  // lights, and the radar that turns on the tower.
  cityHall: {
    pull: 4,
    // The cupola is the recognising part, so it has to survive the silhouette
    // pass that flattens everything else.
    tall: true,
    masses: [
      box(-0.85, 0, -0.8, 0.85, 0.72, 0.72, "white"),
      box(-0.9, 0.72, -0.85, 0.9, 0.8, 0.76, "dark"),
      // The portico: four columns, a pediment over them and the steps up.
      // The columns were 0.12 of the lot — 7 m thick on a 3-tile hall, which
      // the close frame (S19) showed as piers rather than columns. 0.08 is
      // 4.8 m: still stout, and a colonnade rather than a wall with gaps.
      box(-0.6, 0, 0.72, -0.52, 0.68, 0.8, "white", true),
      box(-0.28, 0, 0.72, -0.2, 0.68, 0.8, "white", true),
      box(0.2, 0, 0.72, 0.28, 0.68, 0.8, "white", true),
      box(0.52, 0, 0.72, 0.6, 0.68, 0.8, "white", true),
      box(-0.7, 0.68, 0.68, 0.7, 0.84, 0.9, "white"),
      box(-0.72, 0, 0.9, 0.72, 0.06, 1, "concrete"),
      // The doors, and the clock cupola over the middle of the hall.
      box(-0.2, 0.06, 0.66, 0.2, 0.5, 0.74, "glass"),
      box(-0.17, 0.8, -0.1, 0.17, 1.28, 0.24, "white", true),
      box(-0.11, 0.95, 0.2, 0.11, 1.17, 0.3, "glass"),
      box(-0.18, 1.28, -0.11, 0.18, 1.4, 0.25, "dark", true),
    ],
  },
  airport: {
    pull: 6,
    // The tower is a mast: an airport whose tower is flattened to its terminal
    // is a shopping centre with a car park.
    tall: true,
    // And it has an AXIS: the masses are authored in the LOT's own frame and
    // must not be turned to face the street, because the ground plan beside
    // them (`airfield.js`) cannot be (ruling 044).
    axis: true,
    masses: [
      // The terminal, along the street half of the lot, glazed at the front.
      //
      // HALF the height a 3x3 definition would use for the same storeys: the
      // kit's unit is the LOT, so a 6x4 lot makes every y twice the metres a
      // hospital's does. The first cut was a warehouse with an eighty-metre
      // tower over it, which is what the aerial shot showed and no test could.
      box(-0.76, 0, BANDS.terminal.z0 + 0.04, 0.76, 0.19, BANDS.terminal.z1 - 0.04, "white"),
      box(-0.8, 0.19, BANDS.terminal.z0, 0.8, 0.23, BANDS.terminal.z1, "dark"),
      box(-0.7, 0.02, BANDS.terminal.z1 - 0.04, 0.7, 0.17, BANDS.terminal.z1 + 0.03, "glass"),
      // The tower, at one end of it, with a glazed cab on top.
      box(0.83, 0, 0.52, 0.96, 0.62, 0.66, "concrete", true),
      box(0.77, 0.62, 0.45, 1, 0.73, 0.72, "glass"),
      box(0.79, 0.73, 0.47, 0.99, 0.77, 0.7, "dark"),
      // The apron and the runway, from the SAME bands the ground plan is built
      // from (T5b): `airfield.js` lays the asphalt, the paint and the lights
      // inside these, so the block at city zoom and the surface at street level
      // cannot drift apart (E5's L2/L3 rule).
      //
      // The slabs keep their thickness while everything above them halved: at
      // 0.02 they sank under the lot's LAWN QUAD and the aerial shot showed a
      // terminal standing in a field. A flat thing on a lot has a floor.
      { ...box(-0.98, 0, BANDS.apron.z0, 0.98, 0.05, BANDS.apron.z1, "concrete"), ground: true },
      { ...box(-0.98, 0, BANDS.runway.z0, 0.98, 0.04, BANDS.runway.z1, "dark"), ground: true },
    ],
    // The radar turns on the tower's cap (T5b). The same arrangement as the
    // turbine's `hub`: a point in the shape's own unit space, posed by the
    // instanced pass, so it sits where the baked tower is at every zoom.
    radar: { x: 0.89, y: 0.79, z: 0.585 },
  },
  // The cheap rows (T7, A70). Each one has to be told from the thing it is a
  // bigger or smaller version of at a glance: a clinic from a hospital, a
  // headquarters from a station, a reservoir from a water tower.
  clinic: {
    pull: 3,
    tall: false,
    masses: [
      // One tile, so it is small and must still read: a flat-roofed box, a
      // glazed door and a red cross over it.
      box(-0.8, 0, -0.8, 0.8, 0.62, 0.7, "white"),
      box(-0.86, 0.62, -0.86, 0.86, 0.7, 0.76, "dark"),
      box(-0.3, 0.03, 0.7, 0.3, 0.46, 0.78, "glass"),
      box(-0.06, 0.3, 0.72, 0.06, 0.58, 0.8, "red"),
      box(-0.2, 0.41, 0.72, 0.2, 0.47, 0.8, "red"),
    ],
  },
  policeHQ: {
    pull: 3,
    // A tower over the station: the thing that says HEADQUARTERS from across
    // the city is that it is taller than the station it replaced.
    tall: true,
    masses: [
      box(-0.95, 0, -0.9, 0.95, 0.5, 0.5, "concrete"),
      box(-0.98, 0.5, -0.95, 0.98, 0.56, 0.55, "dark"),
      box(-0.45, 0, -0.5, 0.45, 1.25, 0.2, "glass"),
      box(-0.5, 1.25, -0.55, 0.5, 1.33, 0.25, "dark"),
      // The blue lamp over the door, and the steps.
      box(-0.25, 0.04, 0.5, 0.25, 0.44, 0.6, "glass"),
      box(-0.06, 0.46, 0.52, 0.06, 0.6, 0.64, "steel", true),
      box(-0.6, 0, 0.6, 0.6, 0.05, 0.78, "concrete"),
    ],
  },
  fireHQ: {
    pull: 2,
    tall: true,
    masses: [
      // Four doors rather than the station's two, and the drill tower.
      box(-0.95, 0, -0.9, 0.95, 0.62, 0.55, "brick"),
      box(-0.98, 0.62, -0.95, 0.98, 0.7, 0.6, "dark"),
      box(-0.88, 0.04, 0.55, -0.5, 0.5, 0.64, "red"),
      box(-0.42, 0.04, 0.55, -0.04, 0.5, 0.64, "red"),
      box(0.04, 0.04, 0.55, 0.42, 0.5, 0.64, "red"),
      box(0.5, 0.04, 0.55, 0.88, 0.5, 0.64, "red"),
      box(0.55, 0, -0.85, 0.9, 1.35, -0.5, "concrete"),
      box(0.52, 1.35, -0.88, 0.93, 1.42, -0.47, "dark"),
    ],
  },
  reservoir: {
    pull: 0,
    // A tank in the ground rather than on legs, which is what tells it from
    // the water tower beside it in the menu.
    tall: false,
    masses: [
      box(-0.95, 0, -0.95, 0.95, 0.12, 0.95, "concrete"),
      box(-0.85, 0.12, -0.85, 0.85, 0.34, 0.85, "glass"),
      box(-0.95, 0.1, -0.95, -0.82, 0.4, 0.95, "concrete"),
      box(0.82, 0.1, -0.95, 0.95, 0.4, 0.95, "concrete"),
      box(-0.82, 0.1, -0.95, 0.82, 0.4, -0.82, "concrete"),
      box(-0.82, 0.1, 0.82, 0.82, 0.4, 0.95, "concrete"),
      // The pump house on the end.
      box(0.3, 0.12, 0.3, 0.75, 0.6, 0.75, "white"),
      box(0.26, 0.6, 0.26, 0.79, 0.66, 0.79, "dark"),
    ],
  },
  wasteFacility: {
    pull: 0,
    tall: true,
    masses: [
      // A shed with a chimney and two skips: the chimney is the recognising
      // part and the skips are what say RUBBISH rather than factory.
      box(-0.9, 0, -0.9, 0.5, 0.66, 0.4, "steel"),
      box(-0.95, 0.66, -0.95, 0.55, 0.74, 0.45, "dark"),
      box(0.2, 0.66, -0.6, 0.44, 1.5, -0.36, "brick", true),
      box(-0.6, 0.05, 0.4, -0.2, 0.3, 0.8, "red"),
      box(-0.1, 0.05, 0.4, 0.3, 0.3, 0.8, "steel"),
      box(0.55, 0, -0.9, 0.95, 0.08, 0.9, "concrete"),
    ],
    // The chimney smokes, like the two power stations (S6).
    emits: [{ x: 0.32, y: 1.5, z: -0.48 }],
  },

  // Leisure and education (T6, A67/A70). Five definitions, five silhouettes,
  // and the recognising part of each is the part that carries from the
  // pavement: a stadium is a bowl, a school is a long low block with a yard, a
  // library has a portico and a plaza is not a building at all.
  plaza: {
    pull: 6,
    // Paving, trees in it and a fountain. No building (the park's own rule):
    // what makes a square is that it is OPEN.
    tall: false,
    masses: [
      box(-1, 0, -1, 1, 0.03, 1, "concrete"),
      box(-0.16, 0.03, -0.16, 0.16, 0.1, 0.16, "white", true),
      box(-0.1, 0.1, -0.1, 0.1, 0.34, 0.1, "white", true),
      box(-0.3, 0.03, -0.9, -0.1, 0.06, -0.7, "lawn"),
      box(0.1, 0.03, 0.7, 0.3, 0.06, 0.9, "lawn"),
      box(-0.9, 0.03, 0.1, -0.7, 0.06, 0.3, "lawn"),
    ],
  },
  library: {
    pull: 4,
    tall: false,
    masses: [
      box(-0.85, 0, -0.8, 0.85, 0.78, 0.6, "brick"),
      box(-0.9, 0.78, -0.85, 0.9, 0.86, 0.65, "dark"),
      // A portico over the steps: four columns and a lintel, which is what a
      // library has had since there were libraries.
      box(-0.6, 0, 0.6, -0.48, 0.66, 0.74, "white", true),
      box(-0.2, 0, 0.6, -0.08, 0.66, 0.74, "white", true),
      box(0.08, 0, 0.6, 0.2, 0.66, 0.74, "white", true),
      box(0.48, 0, 0.6, 0.6, 0.66, 0.74, "white", true),
      box(-0.7, 0.66, 0.56, 0.7, 0.8, 0.78, "white"),
      box(-0.3, 0.04, 0.52, 0.3, 0.5, 0.6, "glass"),
      box(-0.72, 0, 0.78, 0.72, 0.05, 0.92, "concrete"),
    ],
  },
  stadium: {
    pull: 8,
    // The bowl is the whole building and it has to survive the silhouette
    // pass: a flattened stadium is a car park with a fence.
    tall: true,
    masses: [
      // Four stands around an open pitch, rather than a solid block — the
      // inside is what says stadium from above.
      box(-1, 0, -1, 1, 0.12, -0.55, "concrete"),
      box(-1, 0, 0.55, 1, 0.12, 1, "concrete"),
      box(-1, 0, -0.55, -0.55, 0.12, 0.55, "concrete"),
      box(0.55, 0, -0.55, 1, 0.12, 0.55, "concrete"),
      box(-0.98, 0.12, -0.98, 0.98, 0.5, -0.6, "white"),
      box(-0.98, 0.12, 0.6, 0.98, 0.5, 0.98, "white"),
      box(-0.98, 0.12, -0.6, -0.6, 0.44, 0.6, "white"),
      box(0.6, 0.12, -0.6, 0.98, 0.44, 0.6, "white"),
      // The pitch, and four floodlights on the corners.
      box(-0.52, 0, -0.52, 0.52, 0.04, 0.52, "lawn"),
      box(-0.99, 0.5, -0.99, -0.88, 0.95, -0.88, "steel", true),
      box(0.88, 0.5, -0.99, 0.99, 0.95, -0.88, "steel", true),
      box(-0.99, 0.5, 0.88, -0.88, 0.95, 0.99, "steel", true),
      box(0.88, 0.5, 0.88, 0.99, 0.95, 0.99, "steel", true),
    ],
  },
  school: {
    pull: 6,
    tall: false,
    masses: [
      // A long low block with a wing, and a yard in front of it: the yard is
      // half of what says school rather than office.
      box(-0.9, 0, -0.9, 0.5, 0.6, -0.1, "red"),
      box(-0.95, 0.6, -0.95, 0.55, 0.67, -0.05, "dark"),
      box(0.5, 0, -0.9, 0.9, 0.46, -0.4, "brick"),
      box(-0.6, 0.05, -0.1, -0.2, 0.42, -0.02, "glass"),
      box(-0.9, 0, 0.0, 0.9, 0.04, 0.9, "concrete"),
      // A flagless pole and a bike shed, because a yard with nothing in it
      // reads as a car park.
      box(-0.06, 0.04, 0.3, 0.06, 0.52, 0.42, "steel", true),
      box(0.4, 0.04, 0.5, 0.86, 0.22, 0.86, "steel"),
    ],
  },
  university: {
    pull: 8,
    // A tower over a quad: the tower is the recognising part at any zoom.
    tall: true,
    masses: [
      box(-0.95, 0, -0.95, 0.95, 0.52, -0.3, "brick"),
      box(-0.95, 0, 0.3, 0.95, 0.52, 0.95, "brick"),
      box(-0.95, 0, -0.3, -0.35, 0.52, 0.3, "brick"),
      box(0.35, 0, -0.3, 0.95, 0.52, 0.3, "brick"),
      box(-0.99, 0.52, -0.99, 0.99, 0.58, -0.26, "dark"),
      box(-0.99, 0.52, 0.26, 0.99, 0.58, 0.99, "dark"),
      // The quad inside, and the clock tower over the gate.
      box(-0.33, 0, -0.28, 0.33, 0.03, 0.28, "lawn"),
      box(-0.22, 0, 0.3, 0.22, 1.25, 0.72, "white"),
      box(-0.12, 0.95, 0.68, 0.12, 1.15, 0.76, "glass"),
      box(-0.26, 1.25, 0.26, 0.26, 1.38, 0.76, "dark"),
      box(-0.16, 0.04, 0.72, 0.16, 0.5, 0.78, "glass"),
    ],
  },
  park: {
    pull: 4,
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
/** Whether a park has a pond (S5). The item said "a pond on a big one", and
 * every park in the catalogue is one tile: a rule on size alone was a pond
 * nothing ever drew. So a big one always, and half of the rest. Both the
 * instanced pass and the estimate ask this, so they cannot disagree. */
export function parkHasPond(building) {
  return building.w * building.h >= 4 || jitter(building.id, 227) < 0.5;
}

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
export function civicSpin(frontage, def) {
  // A shape with an AXIS is not turned to face its street (T5b, ruling 044).
  // The airport's footprint carries its own rotation — `w > h` is which way the
  // runway runs — and a 6×4 lot spun a quarter turn would squash its terminal
  // across the four-tile side while the ground plan, which takes no frontage,
  // stayed where it was. Every other definition is square enough that the two
  // rotations could not disagree.
  if (def !== undefined && civicShape(def).axis === true) return 0;
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
/** What one unit of a civic mass's y is worth, in metres, on this lot: the
 * baked masses, the posed extras and the name board all read it. */
export function civicHeightM(lot, params) {
  const storeys = lot.storeys ?? params.storeys ?? 1;
  return (params.groundH + (storeys - 1) * params.floorH) * (params.state?.progress ?? 1);
}

/** The name board's size and clearances, in metres (R5). */
const SIGN = Object.freeze({ w: 4, h: 1, top: 0.4, gap: 0.15, faceW: 3, depth: 0.12, post: 0.06, postH: 2.2, front: 0.3 });

/**
 * Where a civic building's name board goes (R5), in UNIT space: on the street
 * face (+z) of the mass nearest the frontage, near its top and clear of what
 * stands in front of it (a fire station's doors) — or, where no wall faces the
 * street (a park, a turbine, a water tower), on a post at the entrance.
 *
 * S1b put the board on the LOT's street edge, and a civic building is set back
 * inside its lot: it stood in the garden, edge-on and unlit. `ux` and `uz` are
 * the metres one unit of x and z is worth on this lot, `heightM` one unit of y
 * (`civicHeightM`): the board is a size in metres, the answer is in the units
 * the masses are. Returns `{ x0, x1, y0, y1, z, face }`, or with `post` — a
 * mass to add — instead of `face`.
 */
export function civicSignFace(def, ux, uz, heightM) {
  const masses = civicShape(def).masses;
  // A wall in the FRONT of the lot. Set back behind its tanks, a water works'
  // control building held a board that was unhidden straight on and behind
  // the tanks from anywhere a person stands (R5's shots).
  const walls = masses.filter((m) => !m.rotor && !m.round && m.mat !== "lawn" && m.z1 >= SIGN.front
    && m.y1 - m.y0 >= 0.25 && m.z1 - m.z0 >= SIGN.depth && (m.x1 - m.x0) * ux >= SIGN.faceW);
  let face;
  for (const m of walls) {
    if (!face || m.z1 > face.z1 + 1e-9
      || (Math.abs(m.z1 - face.z1) <= 1e-9 && m.x1 - m.x0 > face.x1 - face.x0)) face = m;
  }
  if (face) {
    const wM = Math.min(SIGN.w, (face.x1 - face.x0) * ux * 0.6);
    const w = wM / ux;
    const h = Math.min(SIGN.h, wM / 4) / heightM;
    const xc = (face.x0 + face.x1) / 2;
    const x0 = xc - w / 2;
    const x1 = xc + w / 2;
    // Anything standing in front of the face, across the board and below the
    // face's top: the board goes above it.
    const blockers = masses.filter((m) => m !== face && m.z1 > face.z1 - 1e-9
      && m.x0 < x1 && m.x1 > x0 && m.y0 < face.y1);
    let y1 = face.y1 - SIGN.top / heightM;
    let y0 = y1 - h;
    const clear = blockers.length > 0 ? Math.max(...blockers.map((m) => m.y1)) + SIGN.gap / heightM : face.y0;
    if (y0 < clear) {
      y0 = clear;
      y1 = Math.min(face.y1, y0 + h);
    }
    if (y1 - y0 >= h / 2) return { x0, x1, y0, y1, z: face.z1, face };
  }
  const px = 0.4;
  const pz = 0.9;
  const pd = SIGN.post / uz;
  return {
    x0: px - 1 / ux, x1: px + 1 / ux, y0: 1.3 / heightM, y1: 2.1 / heightM, z: pz + pd,
    post: { ...box(px - SIGN.post / ux, 0, pz - pd, px + SIGN.post / ux, SIGN.postH / heightM, pz + pd, "steel") },
  };
}

export function civicPointOnLot(lot, params, point) {
  const quarters = ((civicSpin(lot.frontage, params?.def) % 4) + 4) % 4;
  let x = point.x;
  let z = point.z;
  for (let i = 0; i < quarters; i += 1) {
    const nx = -z;
    z = x;
    x = nx;
  }
  const height = civicHeightM(lot, params);
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

// cityviewer's numbers: a mirror of data/cityviewer.json (rulings 035, 038).
//
// The renderer is created synchronously and the browser cannot import JSON
// without a build step, so the file is mirrored here the way engine/rules.js
// mirrors balance.json, and test/world.test.js refuses to let the two drift.
// `setConfig` is for a boot that has fetched the file, and for tests.

export const DEFAULTS = Object.freeze({
  tileM: 20,
  reliefM: 0.5,
  // How many tiles a chunk is on a side. One number, because three things key
  // off it and they must agree: the terrain mesh's rebuild unit, the LOD's
  // per-chunk plan, and the street cache's bake unit (slice E2).
  chunkTiles: 16,
  // `lanes` is per direction, `stopLine` how far short of a junction a lane
  // stops, both read by the lane graph (E1). `speed` (m/s) and `maxDensity`
  // (cars per 100 m at full load) are read by the traffic simulation (V1).
  // 12 per 100 m is a busy road that still flows: a 4.4 m car keeping a 2 m
  // standing gap jams solid at about 15.6, so a full byte of engine load asks
  // for heavy traffic rather than for gridlock — the jams should come from the
  // signals, which is where a player can see the reason for them.
  road: {
    width: 8, sidewalk: 2.5, blend: 4,
    lanes: 1, stopLine: 2, maxGrade: 0.15, speed: 11, maxDensity: 12, dip: 0.16,
    // L3 only (E3): how far the kerb steps up from the carriageway, how much
    // the road is crowned, and how far the carriageway sits above the ground.
    kerb: 0.15, camber: 0.035, lift: 0.02,
  },
  // Poles and their sagging spans at L3 (E3, spec §5.4).
  wire: { poleSpacing: 60, poleHeight: 7, sag: 1.2, armWidth: 1.4 },
  // Water (E8, spec §5.5). `depth` is how far the bed drops below the surface
  // in open water; `shelf` how many tiles it takes to get there from the shore,
  // so a beach is a beach and not a step. `wade` is how deep a walker may go
  // before the water is a wall (Q58: the walker is kept out of the water).
  // `lift` is how far the drawn surface sits above the water level. Six
  // centimetres, and it is not cosmetic: at the shoreline the bed IS the
  // surface, so a plane at exactly the level is coplanar with the sand and the
  // two z-fight — which at night showed as a river glowing through a black
  // city. The same reason `road.lift` exists.
  water: { depth: 1.4, lift: 0.06, wade: 0.4, opacity: 0.7, shelf: 1 },
  // Haze and sky (V8, spec §7.3). The city camera's fog follows the zoom — the
  // same numbers would be invisible on a 64-tile map and opaque on a 128-tile
  // one — but a walker's eye does not zoom, so street fog is METRES and the
  // dome is scaled to sit inside street mode's far plane rather than a thousand
  // tiles behind it.
  fog: { streetNear: 25, streetFar: 520, domeShare: 0.85 },
  // The L3 prop pass (E5, spec §6.6). A lamp every 24 m alternating sides is
  // about what a residential street has; every 12 m is a runway.
  // `lampInset` is how far a lamp stands OUT from the kerb, not how far it
  // stands from the centre line. It was the middle of the pavement, which is
  // where a walker walks: E7 made the furniture solid and the walkthrough gate
  // ground to a halt on a post every 24 m (A43).
  props: {
    lampSpacing: 24, lampInset: 0.5, lampH: 4.5, hedgeH: 0.9,
    // A nine-metre tree with a three-metre crown (V8). The instanced kit's
    // cone is 0.26 of a tile, which is 5.2 m — right at city zoom and small
    // standing under it.
    treeH: 9, treeR: 3.2,
    pathW: 1.2, binEvery: 60,
  },
  // Pedestrians (E7, spec §9.3). `perOccupant` is how many people a building's
  // occupancy asks for on the pavement outside it — 5%, which on the 48-tile
  // shoot fixture (712 residents in 89 buildings) is a street with somebody on
  // it rather than a ghost town, and on anything larger the tier's cap binds
  // long before it does; `spacing` is the gap one
  // keeps behind another; `bob` and `stride` are the walk cycle, which is the
  // whole difference between a person and a post that slides.
  ped: {
    pace: 1.35, paceVary: 0.35, perOccupant: 0.05,
    bob: 0.055, stride: 0.85, spacing: 1.6, crossWait: 1,
  },
  // Time of day (E6, spec §7.3). Presets, not a slider: each one is a
  // composition. `key`, `hemi` and `sunHeight` are FACTORS on whatever the
  // style's rig already says, so a preset changes the hour without changing
  // which of the three looks you chose (ruling 017); the colours are absolute,
  // because "the same blue, dimmer" is not what dusk looks like. `night` is
  // what the lit windows and the lamps are dialled by.
  presets: {
    day: {
      key: 1, keyColour: 0xfffaf0, hemi: 1, hemiSky: 0xdcecff, hemiGround: 0x93aa78,
      sky: 0xbfe0f0, fogNear: 1.4, fogFar: 5, night: 0, sunHeight: 1,
    },
    sunset: {
      key: 0.9, keyColour: 0xffb066, hemi: 0.8, hemiSky: 0xffc9a0, hemiGround: 0x6d5f66,
      sky: 0xf2b98a, fogNear: 1, fogFar: 3.6, night: 0.4, sunHeight: 0.22,
    },
    night: {
      key: 0.16, keyColour: 0x8fa8d8, hemi: 0.34, hemiSky: 0x2b3a5c, hemiGround: 0x1b2130,
      sky: 0x121a2c, fogNear: 0.7, fogFar: 2.6, night: 1, sunHeight: 0.5,
    },
  },
  // The ground's own colour (V3). `blend` at 0 reproduces the flat per-tile
  // picture exactly; `mottle` is the per-tile lightness scatter; `urbanReach`
  // is how far from a street the tended ground extends, and `farTone` how much
  // darker and greyer the country beyond it goes.
  ground: { blend: 1, mottle: 0.06, urbanReach: 40, farTone: 0.12 },
  lot: {
    setback: { none: 2, residential: 3, commercial: 0, industrial: 2 },
    bayW: { none: 6, residential: 6, commercial: 5, industrial: 8 },
    floorH: { none: 4, residential: 3, commercial: 3.6, industrial: 5 },
    groundH: { none: 4.5, residential: 3, commercial: 4.5, industrial: 6 },
  },
  // The ink and grade pass (P2, spec §7.4). One grade per time-of-day preset,
  // because a split-tone that is right at noon is a different one at midnight:
  // `shadowTint` and `highlightTint` are what the darks and the lights are
  // pulled towards, and `ink` scales the line so a night street is not drawn in
  // hard black.
  grades: {
    day: {
      shadowTint: 0xb9c6e0, highlightTint: 0xfff2d8,
      lift: 0.015, gain: 1.02, saturation: 1.05, ink: 1, inkColour: 0x2a2f3a,
    },
    sunset: {
      shadowTint: 0x8f8ec0, highlightTint: 0xffd2a0,
      lift: 0.02, gain: 1, saturation: 1.1, ink: 0.9, inkColour: 0x3a2a2e,
    },
    night: {
      shadowTint: 0x6f86c0, highlightTint: 0xffe0b0,
      lift: 0.03, gain: 0.98, saturation: 0.85, ink: 0.75, inkColour: 0x10141f,
    },
  },
  // Ruling 040: rendering only. Nothing here reaches a command, a reducer or
  // the map size — a tier that changed the simulation would be hashed state,
  // and two players on different tiers would desync on the first month tick.
  //
  // `pixelRatio` is a CAP on the device's own ratio, not a replacement for it.
  // `carCap: 0` means uncapped. `pedCapCity` is the crowd seen from the air
  // (B7), spread over the city by demand; `pedCap` is E7's near-eye crowd. `post` lists the passes a tier may run; the
  // frame-time governor may still take one away (`frameMs` is its target).
  //
  // **`frameMs` is a threshold with headroom, not the refresh interval.** It was
  // the interval — 16 at High, 33 at Low and Medium — and a display locked to
  // 60 Hz delivers 16.666 ms, so `p95 <= target` was false forever and the
  // governor spent the entire ladder on a machine hitting its target exactly.
  // Kjell's RTX 4090 card (D2, 2026-09-08) reported `pixel,ink,shadows,
  // supersample` given up on all nine sweep steps at a flat p50 of 16.7 ms.
  // 20 ms is 60 fps with a fifth of a frame of room; 40 ms is 30 fps with the
  // same. One interval late — 33.3 at High, 66.7 at Low — still costs a pass.
  tiers: {
    low: {
      budget: 40000, pixelRatio: 1, antialias: false, shadowMap: 0, lamps: 0,
      shadows: false, streetChunks: 0, carCap: 60, pedCap: 0, pedCapCity: 0,
      post: [], frameMs: 40,
    },
    medium: {
      budget: 140000, pixelRatio: 1.5, antialias: true, shadowMap: 2048, lamps: 5,
      shadows: true, streetChunks: 4, carCap: 200, pedCap: 40, pedCapCity: 200,
      post: ["pixel"], frameMs: 40,
    },
    high: {
      budget: 400000, pixelRatio: 2, antialias: true, shadowMap: 4096, lamps: 8,
      shadows: true, streetChunks: 9, carCap: 0, pedCap: 120, pedCapCity: 600,
      post: ["pixel", "ink"], frameMs: 20,
    },
  },
});

export const TIERS = ["low", "medium", "high"];

/** The tier a device gets before anyone chooses one (ruling 040). The classes
 * come from `capabilities.js`; the mapping is here so it is pure and testable
 * and so `settings-model.js` never has to touch `navigator`. */
export const TIER_FOR_DEVICE = Object.freeze({
  "phone-weak": "low",
  phone: "medium",
  "desktop-weak": "medium",
  desktop: "high",
});

export function tierFor(deviceClassName) {
  return TIER_FOR_DEVICE[deviceClassName] ?? "medium";
}

/** One tier's numbers, always a legal one. */
export function tierConfig(name) {
  const tiers = getConfig().tiers;
  return tiers[name] ?? tiers.medium;
}

let config = DEFAULTS;

export function setConfig(next) {
  config = Object.freeze({ ...DEFAULTS, ...next });
}

export function getConfig() {
  return config;
}

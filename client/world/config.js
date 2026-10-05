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
    // The retaining wall (S18, Q145 → A128). Where the shoulder falls more than
    // `wallMinDrop` between the kerb and `wallOut` metres beyond it, the face is
    // stone with a coping rather than grass hanging in the air. **Three metres
    // is a storey** (A128's words), and the ladder is why: at 1.2 m a played
    // `hilly` 128 has 916 faced shoulders of which 652 are under two metres —
    // which is a grass bank, not a wall — and a rolling 96 has 51. At 3 m the
    // hilly map has 177 and the rolling one none, which is the rarity the
    // question describes. `wallMaxDrop` is the backstop, since the foot of a
    // wall beside water is the water's surface rather than the bed under it.
    wallMinDrop: 3, wallOut: 4, wallMaxDrop: 24, coping: 0.4,
    lanes: 1, stopLine: 2, maxGrade: 0.15, speed: 11, maxDensity: 12, dip: 0.16,
    // How far a junction's height may leave its own land so that the street
    // either side of it can be graded (S11, A87) — a cutting or an embankment,
    // in metres. Measured as a ladder on `hilly` 128 (ungradeable corridors of
    // 1,458 / cliffs on the walked route): 0 → 485/177, 3 → 349/66, 6 → 226/30,
    // 10 → 99/19. Six, because on `rolling` — the terrain every other gate
    // measures — it moves 3% of junctions, by 1.19 m at worst, and takes the
    // last 8 ungradeable corridors to none. At zero the whole rule is off,
    // which is what lets one harness shoot the before and the after.
    junctionDrift: 6,
    // A bridge's deck, over the water it crosses (S13, A84/A111).
    // `deckClearance` is the deck's own SURFACE above the water and `deckDepth`
    // the girder hanging under it, so what passes beneath has
    // 5 - 1 = 4 m. That number is the ferry's: its slab is 3.4 m tall
    // (`instances.js`), the sailing boat's 1.6, and a clearance under the
    // tallest vessel in the city is the point of a deck rather than a causeway.
    // The ramps either side climb it at `maxGrade` — 15% is 33 m of approach on
    // each bank, under two tiles.
    deckClearance: 5, deckDepth: 1,
    // L3 only (E3): how far the kerb steps up from the carriageway, how much
    // the road is crowned, and how far the carriageway sits above the ground.
    kerb: 0.15, camber: 0.035, lift: 0.02,
    // The verge from the air (Q102, A113): a road TILE is a carriageway, two
    // pavements and two verges (ruling 035), and the city camera painted the
    // whole 20 m of it asphalt — so a street read as two houses wide where the
    // reference's is two thirds of one. The terrain mesh splits a straight road
    // tile into three bands now, and `minVerge` is the width below which the
    // strip is not worth four triangles: an avenue's is 0.5 m and an avenue
    // filling its tile is right. Set it large and every road tile is paved
    // corner to corner again, which is how the before and the after are shot
    // from one harness.
    minVerge: 1,
    // The second road kind (T1). `width` is the whole carriageway, `median`
    // the strip down the middle of it, so a lane is (width - median) / (2 ×
    // lanes) = 3 m. Fourteen and not more: the pavement and the verge live in
    // the same twenty-metre tile, and 14 + 2 × 2.5 leaves half a metre of
    // verge either side. `median: 0` would be a dual carriageway with nothing
    // between the two halves, which is a wide road, not an avenue.
    avenue: { width: 14, lanes: 2, median: 2 },
  },
  // The railway (T3). `width` is the ballast, `gauge` how far apart the two
  // rails are, and `lift` how high the ballast stands above the ground — a
  // track is built UP on a bed, which is most of what tells it from a road
  // that happens to be narrow. `speed` is the train's (m/s), `dwell` how long
  // it stands at a platform in seconds, and the carriage numbers are its kit.
  rail: {
    // A line cuts and embanks rather than following the ground (Q120, A118).
    // Four per cent is a steep main line — a road may climb 15% and a train may
    // not — and it is the gradient the track's own profile is held to. The
    // HEIGHT FIELD does not move: the cutting and the embankment are drawn
    // under the ballast, so no lot, lane or walker is re-measured for a line
    // nobody stands on. `maxGrade: 0` turns the whole thing off, which is how
    // one harness shoots the before and the after.
    maxGrade: 0.04,
    width: 4, gauge: 1.5, railHalf: 0.08, sleeperEvery: 1.6, sleeperHalf: 0.14, lift: 0.1,
    speed: 22, carriages: 3, carriageLen: 17, carriageW: 2.9, carriageH: 3.4, dwell: 14,
  },
  // Boats (T4b). `length` is a hull in metres — what a sailing boat looks
  // AHEAD by, so it turns before its bow is on the beach rather than when its
  // middle is. `openTilesPerBoat` is how much open water a body needs before
  // it carries another one, so a pond gets none and a bay gets three.
  // Colours are hex through JSON, which has no 0x.
  boat: {
    length: 7, perBody: 3, openTilesPerBoat: 12, mooredCap: 24,
    // The hulls, in metres, because what passes under S13's bridge has to fit
    // under it: the free clearance there is `road.deckClearance` minus
    // `road.deckDepth`, and `test/boats.test.js` compares the two. They were
    // literals inside `instances.js`, which three means node cannot read — so
    // the one number the bridge depends on lived where no test could see it.
    hullW: 2.2, hullH: 1.6, ferryW: 5, ferryH: 3.4,
    sailSpeed: 4, ferrySpeed: 9, cargoSpeed: 6, dwell: 10, wake: 8,
    hullColour: 0xf0f0f0, sailColour: 0xf8f8f8, ferryColour: 0x3376cc,
    cargoColour: 0x8b8b8b, wakeColour: 0xe1ece4,
  },
  // The airfield (T5b). `runwayHalf` and `taxiwayHalf` are metres either side
  // of a centreline; the BANDS the strips sit in are in `airfield.js`, with the
  // silhouette that reads them. `approachM` is how far outside the region a
  // plane starts, and `climbGrade` what it climbs at — the same shape as a
  // road's `maxGrade`, and nothing to do with the engine's `airport.maxDrop`,
  // which is about the ground.
  airport: {
    runwayHalf: 9, taxiwayHalf: 4.5, paintW: 0.9, dashM: 14, gapM: 12,
    thresholdBars: 6, thresholdM: 9, lightSpacingM: 22, lift: 0.05,
    approachM: 420, cruiseSpeed: 62, taxiSpeed: 9, turnaround: 16, climbGrade: 0.11,
    wingspan: 24, fuselage: 32, planeColour: 0xf2f2f2, radarSpan: 4,
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
  // `bank` is the other half of `shelf`, on the dry side (S12): how many tiles
  // the land takes to come up to its own height from the waterline. At one tile
  // — which is what a cut capped at the bank amounts to — a shore under high
  // ground fell 7.44 m over 20 m, a 37% quay wall nobody can walk up. Three
  // tiles is 60 m for that same drop, 12%, under `road.maxGrade`.
  water: { depth: 1.4, lift: 0.06, wade: 0.4, opacity: 0.7, shelf: 1, bank: 3 },
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
    // 0.15 since B5: the crowd was never held to 5% — a person who walked off
    // their pavement left it asking again (E7's fill by presence), and the
    // streets everyone judged since E7 and B7 had three to four times it. Held
    // to its demand, 5% was 86 people on the whole played 64×64 and an empty
    // street; 15% is about the picture that was accepted.
    pace: 1.35, paceVary: 0.35, perOccupant: 0.15,
    // What a shop and a works pull, per LEVEL (B10): the engine keeps no
    // occupancy for either, so without these two numbers a high street is a
    // pavement nobody is allowed to stand on. 3 puts a level-1 corner shop at
    // about the pull of a half-full house and a level-3 parade at twice it; a
    // works is a third of that, because people go through a factory gate twice
    // a day and into a shop all afternoon.
    perShop: 3, perWorks: 1,
    // How close somebody gets to the EYE before they stop being drawn, in
    // metres (B10). The walker has no collision and walks through the crowd;
    // at 1.2 m a person is a torso across the whole frame, and at the lens they
    // are a red wall. Not a push: the renderer does not get to move people.
    clearance: 1.2,
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
      // **Unchanged, and that is a measurement** (S15). Two lifts were tried
      // and both are recorded in the dev-log: `hemiGround` moved nothing, which
      // is the physics — a hemisphere light's ground colour lights surfaces
      // facing DOWN and a field faces up — and `hemi: 1.3` lifted the grass by
      // nine while pushing the asphalt nine PAST the reference it had just been
      // matched to. What was left after the day grade's gain is material, not
      // light.
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
    // B6: overcast and rain. A low flat key, a grey dome and the fog closer in;
    // `night` 0.25 lights a few lamps without the city reading as dusk.
    rain: {
      key: 0.42, keyColour: 0xc9cfd6, hemi: 0.62, hemiSky: 0x9aa6b2, hemiGround: 0x6f7a72,
      sky: 0x9fa9b4, fogNear: 0.6, fogFar: 2.4, night: 0.25, sunHeight: 0.75,
    },
  },
  // The ground's own colour (V3). `blend` at 0 reproduces the flat per-tile
  // picture exactly; `mottle` is the per-tile lightness scatter; `urbanReach`
  // is how far from a street the tended ground extends, and `farTone` how much
  // darker and greyer the country beyond it goes.
  // `tone` is how far a grass tile goes toward the second grass colour where
  // the coarse noise says so (S2) — 0 is one green.
  ground: { blend: 1, mottle: 0.06, urbanReach: 40, farTone: 0.12, tone: 0.55 },
  lot: {
    // S16a's ladder, as a LEVER. `ladder=0` in the shot harness draws every
    // trade lot as the one mass it was before, so the before and the after of a
    // picture come from one harness rather than from two commits (the shape
    // S18's `wall=0` has — a fallback nothing can turn off is a fallback no
    // gate can photograph).
    ladder: true,
    // `residential` halved to 1.5 at A113 (Q102): the setback is an inset on
    // all four sides of the tile, so it moves the GAPS between houses rather
    // than the house, and a 10 m house on a 14 m lot read as a street 1.3
    // houses wide. A 13 m house on a 17 m lot is the reference's proportion.
    setback: { none: 2, residential: 1.5, commercial: 0, industrial: 2 },
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
      // `gain` 1.02 → 1.12 in S15: every class the sieve measures was darker
      // than the reference, and a tenth of exposure is what the whole frame was
      // short before the per-material moves.
      lift: 0.015, gain: 1.12, saturation: 1.05, ink: 1, inkColour: 0x2a2f3a,
    },
    sunset: {
      shadowTint: 0x8f8ec0, highlightTint: 0xffd2a0,
      lift: 0.02, gain: 1, saturation: 1.1, ink: 0.9, inkColour: 0x3a2a2e,
    },
    night: {
      shadowTint: 0x6f86c0, highlightTint: 0xffe0b0,
      lift: 0.03, gain: 0.98, saturation: 0.85, ink: 0.75, inkColour: 0x10141f,
    },
    // B6: overcast. The colour comes down — a grey day is a desaturated one —
    // and the ink softens with it; a hard black outline under flat light reads
    // as a mistake, which is the same reason night's line is soft.
    rain: {
      shadowTint: 0x8894a4, highlightTint: 0xd8e2ea,
      lift: 0.025, gain: 0.98, saturation: 0.72, ink: 0.8, inkColour: 0x223038,
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

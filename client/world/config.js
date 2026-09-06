// cityviewer's numbers: a mirror of data/cityviewer.json (rulings 035, 038).
//
// The renderer is created synchronously and the browser cannot import JSON
// without a build step, so the file is mirrored here the way engine/rules.js
// mirrors balance.json, and test/world.test.js refuses to let the two drift.
// `setConfig` is for a boot that has fetched the file, and for tests.

export const DEFAULTS = Object.freeze({
  tileM: 20,
  reliefM: 0.5,
  // `lanes` is per direction, `stopLine` how far short of a junction a lane
  // stops, both read by the lane graph (E1). `speed` (m/s) and `maxDensity`
  // (cars per 100 m at full load) are read by the traffic simulation (V1).
  // 12 per 100 m is a busy road that still flows: a 4.4 m car keeping a 2 m
  // standing gap jams solid at about 15.6, so a full byte of engine load asks
  // for heavy traffic rather than for gridlock — the jams should come from the
  // signals, which is where a player can see the reason for them.
  road: {
    width: 8, sidewalk: 2.5, blend: 4,
    lanes: 1, stopLine: 2, speed: 11, maxDensity: 12, dip: 0.16,
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
  // Ruling 040: rendering only. Nothing here reaches a command, a reducer or
  // the map size — a tier that changed the simulation would be hashed state,
  // and two players on different tiers would desync on the first month tick.
  //
  // `pixelRatio` is a CAP on the device's own ratio, not a replacement for it.
  // `carCap: 0` means uncapped. `post` lists the passes a tier may run; the
  // frame-time governor may still take one away (`frameMs` is its target).
  tiers: {
    low: {
      budget: 40000, pixelRatio: 1, antialias: false, shadowMap: 0,
      shadows: false, streetChunks: 0, carCap: 60, pedCap: 0,
      post: [], frameMs: 33,
    },
    medium: {
      budget: 80000, pixelRatio: 1.5, antialias: true, shadowMap: 2048,
      shadows: true, streetChunks: 4, carCap: 200, pedCap: 40,
      post: ["pixel"], frameMs: 33,
    },
    high: {
      budget: 200000, pixelRatio: 2, antialias: true, shadowMap: 4096,
      shadows: true, streetChunks: 9, carCap: 0, pedCap: 120,
      post: ["pixel", "ink"], frameMs: 16,
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

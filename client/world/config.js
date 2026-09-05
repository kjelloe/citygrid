// cityviewer's numbers: a mirror of data/cityviewer.json (rulings 035, 038).
//
// The renderer is created synchronously and the browser cannot import JSON
// without a build step, so the file is mirrored here the way engine/rules.js
// mirrors balance.json, and test/world.test.js refuses to let the two drift.
// `setConfig` is for a boot that has fetched the file, and for tests.

export const DEFAULTS = Object.freeze({
  tileM: 20,
  reliefM: 0.5,
  road: { width: 8, sidewalk: 2.5, blend: 4 },
  lot: {
    setback: { none: 2, residential: 3, commercial: 0, industrial: 2 },
    bayW: { none: 6, residential: 6, commercial: 5, industrial: 8 },
    floorH: { none: 4, residential: 3, commercial: 3.6, industrial: 5 },
    groundH: { none: 4.5, residential: 3, commercial: 4.5, industrial: 6 },
  },
});

let config = DEFAULTS;

export function setConfig(next) {
  config = Object.freeze({ ...DEFAULTS, ...next });
}

export function getConfig() {
  return config;
}

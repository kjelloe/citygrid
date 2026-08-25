// The placeable-building catalogue: a mirror of data/buildings.json, for the
// same reason engine/rules.js mirrors data/balance.json — engine/ may not do
// I/O. test/catalogue.test.js refuses to let the two drift.
//
// Positive power/water is production, negative is consumption. One sign
// convention for both, so a plant and a hospital are the same kind of thing to
// the supply system and it never needs to ask which.

var CATALOGUE = {
  coalPlant: { category: "power", w: 3, h: 3, cost: 3000, upkeep: 80, power: 700, water: -8, pollution: 90, fireRisk: 30, unlock: 0 },
  gasPlant: { category: "power", w: 2, h: 2, cost: 2200, upkeep: 70, power: 500, water: -5, pollution: 45, fireRisk: 25, unlock: 0 },
  windTurbine: { category: "power", w: 1, h: 1, cost: 600, upkeep: 12, power: 60, water: 0, pollution: 0, fireRisk: 2, unlock: 0 },
  solarPlant: { category: "power", w: 2, h: 2, cost: 2600, upkeep: 30, power: 180, water: 0, pollution: 0, fireRisk: 4, unlock: 0 },

  waterPump: { category: "water", w: 1, h: 1, cost: 400, upkeep: 15, power: -4, water: 300, pollution: 0, fireRisk: 2, needsSurfaceWater: true, unlock: 0 },
  groundwaterPump: { category: "water", w: 1, h: 1, cost: 700, upkeep: 25, power: -6, water: 120, pollution: 0, fireRisk: 2, needsSurfaceWater: false, unlock: 0 },
  waterTreatment: { category: "water", w: 2, h: 2, cost: 1800, upkeep: 60, power: -10, water: 900, pollution: 10, fireRisk: 6, needsSurfaceWater: true, unlock: 0 },
  waterTower: { category: "water", w: 1, h: 1, cost: 500, upkeep: 10, power: -2, water: 0, storage: 200, pollution: 0, fireRisk: 2, unlock: 0 },

  fireStation: { category: "service", w: 2, h: 2, cost: 500, upkeep: 100, power: -6, water: -6, pollution: 0, fireRisk: 0, service: "fire", radius: 12, unlock: 0 },
  policeStation: { category: "service", w: 2, h: 2, cost: 500, upkeep: 100, power: -6, water: -6, pollution: 0, fireRisk: 4, service: "police", radius: 12, unlock: 0 },
  hospital: { category: "service", w: 3, h: 3, cost: 1200, upkeep: 120, power: -14, water: -14, pollution: 0, fireRisk: 6, service: "health", radius: 14, capacity: 400, unlock: 0 },
  park: { category: "amenity", w: 1, h: 1, cost: 60, upkeep: 2, power: 0, water: -1, pollution: -10, fireRisk: 0, landValueBonus: 20, radius: 4, unlock: 0 },
};

export function setCatalogue(loaded) {
  CATALOGUE = loaded;
}

export function catalogue() {
  return CATALOGUE;
}

export function definition(id) {
  if (!Object.hasOwn(CATALOGUE, id)) return undefined;
  return CATALOGUE[id];
}

export function definitionIds() {
  return Object.keys(CATALOGUE).sort();
}

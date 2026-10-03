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
  waterTower: { category: "water", w: 1, h: 1, cost: 500, upkeep: 10, power: -2, water: 0, pollution: 0, fireRisk: 2, unlock: 0 },

  fireStation: { category: "service", w: 2, h: 2, cost: 500, upkeep: 100, power: -6, water: -6, pollution: 0, fireRisk: 0, service: "fire", radius: 12, unlock: 0 },
  policeStation: { category: "service", w: 2, h: 2, cost: 500, upkeep: 100, power: -6, water: -6, pollution: 0, fireRisk: 4, service: "police", radius: 12, unlock: 0 },
  hospital: { category: "service", w: 3, h: 3, cost: 1200, upkeep: 120, power: -14, water: -14, pollution: 0, fireRisk: 6, service: "health", radius: 14, unlock: 0 },
  park: { category: "amenity", w: 1, h: 1, cost: 60, upkeep: 2, power: 0, water: -1, pollution: -10, fireRisk: 0, coverage: "leisure", landValueBonus: 20, radius: 4, unlock: 0 },

  // The first GATE (T2, A65). `gate` names which of the Outside's doors this
  // is; `needsRail` is the only placement rule beyond the usual ones, because
  // power and road access are reasons a station is DEAD rather than reasons it
  // cannot be built — the inspector has to be able to say which.
  railStation: { category: "transport", w: 3, h: 2, cost: 1500, upkeep: 90, power: -8, water: -4, pollution: 8, fireRisk: 8, gate: "rail", needsRail: true, landValueBonus: 14, radius: 6, unlock: 0 },

  // The water (T4, A67, A68). `needsBody` is how many tiles of ONE body the
  // footprint has to stand beside; `needsSeaway` additionally asks that the
  // body reach the edge of the region — which is a placement rule for neither
  // of the gates, because a terminal on a lake is DEAD and the inspector says
  // so rather than the build menu refusing a thing the player can see water
  // next to.
  marina: { category: "amenity", w: 2, h: 2, cost: 900, upkeep: 40, power: -4, water: -2, pollution: 0, fireRisk: 4, needsBody: "marinaMinBody", coverage: "leisure", landValueBonus: 30, radius: 7, unlock: 0 },
  ferryTerminal: { category: "transport", w: 2, h: 2, cost: 1300, upkeep: 80, power: -6, water: -4, pollution: 6, fireRisk: 6, gate: "sea", needsBody: "marinaMinBody", landValueBonus: 8, radius: 5, unlock: 0 },
  freightPort: { category: "transport", w: 3, h: 2, cost: 2200, upkeep: 130, power: -12, water: -6, pollution: 30, fireRisk: 12, gate: "sea", needsBody: "marinaMinBody", unlock: 0 },

  // The top of the progression (T5, A69). `unlock` is read at last — by the
  // reducer, the build menu and the deputy, through `engine/unlock.js`.
  //
  // The city hall is one per seat and marks the rank it grants; the airport is
  // the first building with an AXIS (`orientable`, which swaps the footprint
  // the reducer claims), a rule about the ground under it (`needsFlat`) and
  // noise that carries past its fence (`pollutionRadius`, which T7 renamed when
  // the waste facility turned out to be the same arithmetic with the sign the
  // other way round).
  // The cheap rows (T7, A70): content that costs a row and a kit each, built
  // out of machinery that already works. Two of them were specified in terms of
  // fields nothing reads — `storage` on the water tower and `capacity` on the
  // hospital (Q119, Q127) — so the reservoir PRODUCES water rather than storing
  // it and the headquarters are a bigger radius with no capacity. A dead field
  // on two more buildings is how `landValueBonus` reached four.
  clinic: { category: "service", w: 1, h: 1, cost: 300, upkeep: 45, power: -3, water: -3, pollution: 0, fireRisk: 3, service: "health", radius: 7, unlock: 0 },
  // Both headquarters are `unlock: 0`: the progression is the city hall and the
  // airport (A69), and a definition above the seat's rank is invisible to the
  // DEPUTY as well as to the player — `findSpotFor` answers "nowhere" — so a
  // rank on an everyday service building is a building no headless city has.
  policeHQ: { category: "service", w: 3, h: 3, cost: 1800, upkeep: 260, power: -14, water: -12, pollution: 0, fireRisk: 5, service: "police", radius: 22, unlock: 0 },
  fireHQ: { category: "service", w: 3, h: 3, cost: 1800, upkeep: 260, power: -14, water: -14, pollution: 0, fireRisk: 0, service: "fire", radius: 22, unlock: 0 },
  reservoir: { category: "water", w: 2, h: 2, cost: 1600, upkeep: 45, power: -8, water: 520, pollution: 0, fireRisk: 2, needsSurfaceWater: false, unlock: 0 },
  wasteFacility: { category: "service", w: 2, h: 2, cost: 1400, upkeep: 110, power: -10, water: -6, pollution: -26, fireRisk: 6, pollutionRadius: 9, unlock: 0 },

  // Leisure and education (T6, A67, A70). `coverage` is the field a building
  // deposits into; `service` is the DEPARTMENT it belongs to, which is what the
  // quests count and what the funding row is named after. They are the same
  // word for fire, police and health, and a park has the second without the
  // first — which is why this is not one field.
  plaza: { category: "amenity", w: 2, h: 2, cost: 200, upkeep: 8, power: -1, water: -2, pollution: -4, fireRisk: 1, coverage: "leisure", radius: 6, unlock: 0 },
  library: { category: "service", w: 2, h: 2, cost: 900, upkeep: 50, power: -5, water: -4, pollution: 0, fireRisk: 4, coverage: "leisure", radius: 9, unlock: 0 },
  stadium: { category: "amenity", w: 4, h: 4, cost: 4500, upkeep: 220, power: -20, water: -16, pollution: 12, fireRisk: 10, coverage: "leisure", radius: 14, unlock: 2 },
  school: { category: "service", w: 2, h: 2, cost: 800, upkeep: 70, power: -6, water: -6, pollution: 0, fireRisk: 5, coverage: "education", radius: 10, unlock: 0 },
  university: { category: "service", w: 4, h: 4, cost: 6000, upkeep: 300, power: -24, water: -20, pollution: 0, fireRisk: 8, coverage: "education", radius: 18, unlock: 4 },

  cityHall: { category: "civic", w: 3, h: 3, cost: 6000, upkeep: 200, power: -10, water: -8, pollution: 0, fireRisk: 6, landValueBonus: 16, radius: 8, onePerSeat: true, unlock: 2 },
  airport: { category: "transport", w: 6, h: 4, cost: 14000, upkeep: 450, power: -30, water: -16, pollution: 40, fireRisk: 18, gate: "air", orientable: true, needsFlat: true, pollutionRadius: 10, unlock: 3 },
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

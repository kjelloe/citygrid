// Ruleset access.
//
// Numbers live in data/balance.json, never in engine code — but engine/ may
// not do I/O, and importing JSON would make it depend on data/. So the
// adapter loads the file at boot and calls setRules(); the defaults below are
// a MIRROR of that file, kept identical by test/rules.test.js.
//
// The alternative — reading the JSON here — would put a fetch in the reducer.
// The mirror is duplication, but it is duplication a test refuses to let drift.

import { idiv } from "../shared/idiv.js";

var RULES = {
  era: 17,
  build: {
    road: 10, roadOverWater: 50, avenue: 26, avenueOverWater: 110, wire: 5, wireOverWater: 25, pipe: 8,
    pipeOverWater: 30, rail: 20, railOverWater: 100, zone: 12, dezone: 2, bulldoze: 1, bulldozeWater: 5,
    clearForest: 3,
  },
  upkeep: { road: 1, wire: 0, pipe: 0, rail: 2, policeStation: 100, fireStation: 100, hospital: 120 },
  difficulty: {
    relaxed: { buildCostPercent: 70, taxYieldPercent: 140, upkeepPercent: 80, startingTreasury: 30000, disasterOneIn: 479, demandElasticity: 120 },
    steady: { buildCostPercent: 90, taxYieldPercent: 120, upkeepPercent: 100, startingTreasury: 20000, disasterOneIn: 239, demandElasticity: 100 },
    demanding: { buildCostPercent: 120, taxYieldPercent: 80, upkeepPercent: 120, startingTreasury: 12000, disasterOneIn: 59, demandElasticity: 80 },
  },
  tax: {
    default: 7, min: 0, max: 20,
    dragTable: [200, 150, 120, 100, 80, 50, 30, 0, -10, -40, -100, -150, -200, -250, -300, -350, -400, -450, -500, -550, -600],
    dragScale: 600, responseMonths: 6,
  },
  // The Outside (T2, A65): a LIVE gate's integer terms, its fare and how far
  // that fare reaches. Era 0, untuned against the bases below.
  gate: {
    _comment: "T2 (A65): the Outside is gate buildings, not a second simulation. A LIVE gate adds these integer terms to the regional demand pool, seeds the commuter field as a sink, and takes a fare from every resident within range. ERA 0, UNTUNED against the bases in `demand` below (400/150/150).",
    rail: { residential: 150, commercial: 100, industrial: 200, farePerResident: 1, range: 16 },
    // The sea (T4, A68). A ferry brings people and a port brings freight, so
    // one gate kind carries both and the INDUSTRIAL term is the heavy one —
    // the two buildings differ in what they cost and where they may stand,
    // not in which door out of the region they are.
    sea: { residential: 90, commercial: 80, industrial: 260, farePerResident: 1, range: 14 },
    // The sky (T5, A69). The largest terms there are, and the only gate with a
    // LANDING FEE: a flat monthly sum from the aircraft rather than from the
    // residents in range, so a live airport in an empty region still earns.
    air: { _comment: "T5 (A69): the largest terms there are, plus a LANDING FEE - a flat monthly sum a live airport earns from the aircraft rather than from the residents near it, which is why an airport in an empty region is still worth something. ERA 0, UNTUNED.", residential: 260, commercial: 240, industrial: 300, farePerResident: 2, landingFee: 500, range: 20 },
  },
  airport: {
    _comment: "T5 (A69). maxDrop is the largest difference in `tiles.elevation` the airport's footprint may contain - a runway is flat, and the engine has no metres. Six units is three metres at the renderer's half-metre relief step, a tenth of the grade a road is allowed over the same 120 m, because a road climbs and a runway does not. On a rolling map about one 6x4 site in ten qualifies; on a hilly one almost none, which is the intent.",
    maxDrop: 6,
  },
  // NOT `water`: that is the utilities' block, twenty lines down, and a second
  // one of the same name replaced it outright — in the JSON too, where a
  // duplicate key is silently the last one (T4).
  harbour: {
    _comment: "T4 (A67, A68). marinaMinBody is how many tiles of one body a marina needs beside it - a pond is not a harbour. `water` next to this is the UTILITY's, and a second block of that name silently replaced it. ERA 0, UNTUNED.",
    marinaMinBody: 40,
  },
  demand: {
    residentialCap: 2000, commercialCap: 1500, industrialCap: 1500,
    birthRatePerMille: 20, labourBaseMax: 130, internalMarketDivisor: 370,
    residentialBase: 400, commercialBase: 150, industrialBase: 150,
  },

  service: {
    maxRoadEffect: 32, maxPoliceEffect: 1000, maxFireEffect: 1000,
    fundingMinPercent: 50, fundingMaxPercent: 150,
  },
  multiplayer: { derelictYears: 5, absenceYears: 5, abandonYears: 5, requestExpiryMonths: 12, seasonYears: 25 },
  development: {
    levels: 4,
    residentsPerLevel: [4, 12, 28, 60],
    commercialJobsPerLevel: [3, 9, 20, 44],
    industrialJobsPerLevel: [5, 14, 30, 64],
    landValueForTier: [0, 90, 170, 225],
    roadAccessRadius: 1,
    growthThreshold: 40,
    decayThreshold: -40,
    growthOneIn: 3,
    decayOneIn: 3,
    baseLandValue: 100,
    demandWeight: 60,
    landValueWeight: 40,
    unsuppliedScore: 500,
    supplyReach: 4,
    scanSlices: 4,
    conditionDecay: 25,
    conditionRecovery: 20,
    conditionAfterDowngrade: 50,
  },
  civic: {
    landValueBase: 90, waterfrontBonus: 9, greeneryBonus: 4, pollutionPenalty: 60,
    crimePenalty: 40, serviceValueDivisor: 12, crowdingThreshold: 120,
    // T6 (A67, A70). Leisure and education are the AMENITY half of coverage:
    // the three departments keep a city from going wrong, and these two are
    // what makes one worth moving to. `amenityValueDivisor` is the land-value
    // term (a smaller divisor than the departments' because a library ought to
    // be worth more to a street than a police station is); `amenityDemand` is
    // how much of the average coverage reaches the residential pool, per cent.
    // ERA 0, UNTUNED.
    amenityValueDivisor: 10, amenityDemand: 70,
    industrialPollution: 22, forestCleaning: 6, crimeBase: 110, policeDivisor: 5,
    healthDivisor: 6, noWaterHealthRisk: 60, fireDivisor: 8, buildingFireRisk: 12,
    industrialFireRisk: 30, forestFireRisk: 14, highCrime: 100, highPollution: 60,
  },
  fire: {
    attemptsPerMonth: 2, ignitionDivisor: 9000, baseExtinguish: 2, riskReference: 22,
    damagePerTick: 14, spreadDivisor: 900, buildingFuel: 10, forestFuel: 26,
    _unfought: "B1a (A62): a fire is unaddressed when at least unfoughtPercent of the building's own fire risk is left after coverage - no station in range - and it then spreads unfoughtSpread times as readily while consuming its house more slowly, so it outlives what it is standing on and reaches the next one.",
    unfoughtPercent: 80, unfoughtSpread: 4, unfoughtDamage: 5,
  },
  economy: { residentialDivisor: 150, commercialDivisor: 120, industrialDivisor: 140 },
  population: { workingAgePercent: 55, shoppersPerCommercialJob: 12, industryPerWorkerPercent: 45 },
  disasters: {
    _comment: "era 0, untuned. Frequency is difficulty.disasterOneIn, which already existed; this is only the shape of one.",
    minPopulation: 120,
    warningMonths: 1,
    durationLow: 1,
    durationHigh: 3,
    radiusLow: 3,
    radiusHigh: 7,
    reliefFloor: 3000,
    reliefCap: 6000,
  },
  deputy: {
    _comment: "A81 (B9): the deputy lays a road only within roadReach tiles of a lot that is built, or zoned and supplied; expand reaches a little further than the doctrines that hold back. Era 3. T2: railAtPopulation is the size at which it lays a line to the edge and puts a station on it - just above avenueAtPopulation, so the order is the main road first and the railway after it.",
    buildingsPerStation: 40,
    // The police station mirrors the fire station exactly — same footprint, same
    // price, same upkeep, same rule — because crime has no pressure of its own
    // the way a spreading fire does, and nothing else was ever going to make the
    // deputy build one (H3, A99/Q111).
    buildingsPerPolice: 40,
    // T6: how many buildings the deputy will run before the next school and
    // the next square. A school covers ten tiles and the fire station forty
    // buildings, so these are the same kind of number from the other side.
    // ERA 0, UNTUNED.
    buildingsPerSchool: 25,
    buildingsPerPlaza: 30,
    // A park every twenty buildings (H3, A99/Q133). Cheaper than anything else
    // the deputy builds — 60 and 2 a month — and the smallest thing that carries
    // `landValueBonus`, which G3 made a rule and no headless city could see.
    buildingsPerPark: 20,
    // The cheap rows (T7). A clinic is the cheapest health there is, so it
    // comes more often than a station; the headquarters wait for a town that
    // has outgrown its stations; the reservoir replaces the pump past a size;
    // and the tip is built when the city's own pollution average says so —
    // over DEVELOPED land, which the sweep reports as 2 to 6, so the threshold
    // is 5 and not the 24 the first cut guessed. ERA 0, UNTUNED.
    buildingsPerClinic: 30,
    headquartersAtPopulation: 1800,
    reservoirAtPopulation: 1800,
    tipAtPollution: 5,
    tipAtPopulation: 600,
    // T1a (A60): the size at which the deputy's next block is an avenue. One,
    // so a returning player finds a main road rather than a grid of identical
    // streets.
    avenueAtPopulation: 800,
    // How far either way along the busiest street the upgrade runs.
    avenueTiles: 7,
    railAtPopulation: 900,
    harbourAtPopulation: 1100,
    roadReach: { expand: 4, balance: 3, green: 3, hold: 3 },
  },
  traffic: {
    _comment: "era 0, untuned. roadCapacity is load units per tile before a street reads as full.",
    decayPercent: 70,
    residentsPerCar: 6,
    roadCapacity: 40,
    congestedAt: 200,
    congestionPollution: 6,
    congestionAlertTiles: 60,
    maxCommute: 220,
    // T1a (A60): a second road kind. An avenue holds `avenueCapacity` times a
    // road's load before it reads as full, and the commuter field crosses it at
    // `avenueStep` against a road's `roadStep` — so a grid with one avenue
    // routes onto it even when the avenue is the longer way round.
    avenueCapacity: 2, roadStep: 3, avenueStep: 2,
  },
};

export function setRules(loaded) {
  RULES = loaded;
}

export function rules() {
  return RULES;
}

export function difficultyOf(state) {
  var table = RULES.difficulty;
  var chosen = table[state.options.difficulty];
  return chosen ? chosen : table.steady;
}

/** Build costs scale with difficulty, so a price is never read raw. */
export function buildCost(state, key) {
  var base = RULES.build[key];
  if (base === undefined) return 0;
  return idiv(base * difficultyOf(state).buildCostPercent, 100);
}

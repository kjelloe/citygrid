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
  era: 0,
  build: {
    road: 10, roadOverWater: 50, wire: 5, wireOverWater: 25, pipe: 8,
    pipeOverWater: 30, zone: 12, dezone: 2, bulldoze: 1, bulldozeWater: 5,
    clearForest: 3,
  },
  upkeep: { road: 1, wire: 0, pipe: 0, policeStation: 100, fireStation: 100, hospital: 120 },
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
  demand: {
    residentialCap: 2000, commercialCap: 1500, industrialCap: 1500,
    birthRatePerMille: 20, labourBaseMax: 130, internalMarketDivisor: 370,
    residentialBase: 400, commercialBase: 150, industrialBase: 150,
  },
  power: { coal: 700, gas: 500, wind: 60, solar: 180, nuclear: 2000 },
  water: { pump: 300, groundwaterPump: 120, treatment: 900, tower: 200 },
  service: {
    maxRoadEffect: 32, maxPoliceEffect: 1000, maxFireEffect: 1000,
    fundingMinPercent: 50, fundingMaxPercent: 150,
  },
  milestones: { town: 2000, city: 10000, capital: 50000, metropolis: 100000, megalopolis: 500000 },
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
    decayOneIn: 6,
    baseLandValue: 100,
    demandWeight: 60,
    roadWeight: 30,
    landValueWeight: 40,
    crowdingWeight: 25,
    unsuppliedScore: 500,
    supplyReach: 4,
  },
  civic: {
    landValueBase: 90, waterfrontBonus: 9, greeneryBonus: 4, pollutionPenalty: 60,
    crimePenalty: 40, serviceValueDivisor: 12, crowdingThreshold: 120,
    industrialPollution: 22, forestCleaning: 6, crimeBase: 110, policeDivisor: 5,
    healthDivisor: 6, noWaterHealthRisk: 60, fireDivisor: 8, buildingFireRisk: 12,
    industrialFireRisk: 30, forestFireRisk: 14, highCrime: 100, highPollution: 60,
  },
  fire: {
    attemptsPerMonth: 2, ignitionDivisor: 9000, baseExtinguish: 2, riskReference: 22,
    damagePerTick: 14, spreadDivisor: 900, buildingFuel: 10, forestFuel: 26,
  },
  economy: { residentialDivisor: 150, commercialDivisor: 120, industrialDivisor: 140 },
  population: { workingAgePercent: 55, shoppersPerCommercialJob: 12, industryPerWorkerPercent: 45 },
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

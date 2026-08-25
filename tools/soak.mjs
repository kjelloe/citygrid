// The soak: AI mayors play real cities headlessly, with invariants checked
// every tick and a hash pinned at checkpoints.
//
// This is the gate for any slice that touches growth, economy or services.
// The unit suite proves the pieces work; the soak proves a city built out of
// them survives forty years without falling over.
//
// Usage: node tools/soak.mjs [years] [seeds...]

import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { hashState } from "../engine/state.js";
import { census } from "../engine/development.js";
import { budgetFor } from "../engine/economy.js";
import { makeDeputy, deputyTurn } from "../engine/deputy.js";
import { assertHashable } from "../shared/canonical.js";
import { CMD_TICK, CMD_JOIN } from "../engine/commands.js";
import { TICKS_PER_YEAR, TICKS_PER_MONTH } from "../engine/constants.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";

const DEFAULT_SEEDS = [1001, 1002, 1003, 1004, 1005];

/** Invariants that must hold at every single tick. A violation is a bug in the
 * simulation, not a balance question. */
function checkInvariants(state, tick) {
  const counts = census(state);
  if (state.population < 0) return `negative population at tick ${tick}`;
  if (state.population > counts.housing) {
    return `${state.population} residents in housing for ${counts.housing} at tick ${tick}`;
  }
  for (const building of state.buildings) {
    if (building.level < 1 || building.level > 4) return `building ${building.id} at level ${building.level}`;
    if (building.occupancy < 0) return `building ${building.id} has negative occupancy`;
    if (building.w < 1 || building.h < 1) return `building ${building.id} has no footprint`;
    // Every building tile must point back at the building.
    for (let dy = 0; dy < building.h; dy += 1) {
      for (let dx = 0; dx < building.w; dx += 1) {
        const index = (building.y + dy) * state.width + building.x + dx;
        if (state.tiles.buildingId[index] !== building.id) {
          return `building ${building.id} does not own its own tile at ${index}`;
        }
      }
    }
  }
  // No orphan tiles: a tile pointing at a building that no longer exists is
  // how a city slowly fills with ghosts.
  const ids = new Set(state.buildings.map((b) => b.id));
  for (let i = 0; i < state.tiles.buildingId.length; i += 1) {
    const id = state.tiles.buildingId[i];
    if (id !== 0 && !ids.has(id)) return `tile ${i} points at vanished building ${id}`;
  }
  return "";
}

export function soakOne({ seed, years = 40, size = 64, seats = 1, doctrine = "expand", checkEvery = TICKS_PER_MONTH } = {}) {
  const world = generateWorld(defaultOptions({ seed, width: size, height: size, seats, waterStyle: "river" }));
  if (!world.ok) return { seed, ok: false, reason: `generation failed: ${world.reason}` };
  const state = world.state;

  const deputies = [];
  for (let s = 1; s <= seats; s += 1) {
    apply(state, { type: CMD_JOIN, actor: s, seat: s, name: `Deputy ${s}` });
    deputies.push(makeDeputy(s, doctrine));
  }

  const ticks = years * TICKS_PER_YEAR;
  const checkpoints = {};
  let peakPopulation = 0;
  let bankruptAt = -1;

  for (let tick = 1; tick <= ticks; tick += 1) {
    apply(state, { type: CMD_TICK });
    // Deputies act between ticks, like players.
    if (tick % 6 === 0) {
      for (const deputy of deputies) deputyTurn(state, deputy);
    }
    if (tick % checkEvery === 0) {
      const problem = checkInvariants(state, tick);
      if (problem) return { seed, ok: false, reason: problem, tick };
      try {
        assertHashable(state);
      } catch (error) {
        return { seed, ok: false, reason: `unhashable: ${error.message}`, tick };
      }
    }
    peakPopulation = Math.max(peakPopulation, state.population);
    if (bankruptAt < 0 && state.players.some((p) => p.treasury < 0)) bankruptAt = tick;
    if (tick % (TICKS_PER_YEAR * 10) === 0) checkpoints[`year${tick / TICKS_PER_YEAR}`] = hashState(state);
  }

  const counts = census(state);
  return {
    seed,
    ok: true,
    years,
    population: state.population,
    peakPopulation,
    housing: counts.housing,
    jobs: counts.jobs,
    lots: counts.lots,
    buildings: state.buildings.length,
    treasury: state.players[0].treasury,
    bankruptAt,
    demand: state.demand,
    deputies: deputies.map((d) => ({ built: d.built, zoned: d.zoned, utilities: d.utilities, refusals: d.refusals })),
    supply: state.supply,
    net: budgetFor(state, 1).net,
    checkpoints,
    hash: hashState(state),
  };
}

export function soak({ years = 40, seeds = DEFAULT_SEEDS, size = 64, seats = 1 } = {}) {
  return seeds.map((seed) => soakOne({ seed, years, size, seats }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const years = Number(process.argv[2] ?? 40);
  const seeds = process.argv.length > 3 ? process.argv.slice(3).map(Number) : DEFAULT_SEEDS;
  const results = soak({ years, seeds });
  let failed = 0;
  for (const result of results) {
    if (!result.ok) {
      failed += 1;
      console.log(`seed ${result.seed}: FAILED — ${result.reason}${result.tick ? ` (tick ${result.tick})` : ""}`);
      continue;
    }
    console.log(
      `seed ${result.seed}: pop ${String(result.population).padStart(5)} ` +
      `housing ${String(result.housing).padStart(5)} jobs ${String(result.jobs).padStart(5)} ` +
      `lots R${result.lots.residential}/C${result.lots.commercial}/I${result.lots.industrial} ` +
      `funds ${String(result.treasury).padStart(7)} ` +
      `pow ${result.supply.power.capacity}/${result.supply.power.demand} ` +
      `wat ${result.supply.water.capacity}/${result.supply.water.demand} ` +
      `util ${result.deputies[0].utilities} net ${String(result.net).padStart(6)} hash ${result.hash}`,
    );
  }
  console.log(failed === 0 ? `\nsoak ok — ${results.length} cities, ${years} years each` : `\nSOAK FAILED — ${failed} of ${results.length}`);
  if (failed > 0) process.exit(1);
}

// Fire that expands when nobody comes (slice B1a; A62, Q85).
//
// Kjell: "add fire that expands if not addressed by firedepartement, i.e not
// available or none within range." Q85 asked how restrained a fire should LOOK
// and the answer was about what it should DO, so the item gained an engine half.
//
// What was there: measured on three played 64x64 cities, a fire in the least
// covered building in town peaked at ONE tile alight, spread zero times, and
// took exactly the building it started in. A fire was a building falling over.
//
// The fixture is a terrace — houses side by side, which is the only way a fire
// has anywhere to go — and the difference between the two cases is a real fire
// station in range, not a fireRisk written straight into the tiles: the civic
// pass recomputes that layer every month, so a hand-set risk is a state the
// engine never makes (S3a's lesson).

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { igniteAt } from "../engine/fire.js";
import { rules } from "../engine/rules.js";
import { CMD_JOIN, CMD_TICK } from "../engine/commands.js";
import { FLAG_BURNING, FLAG_POWERED, FLAG_WATERED } from "../engine/constants.js";
import { tileAt } from "../shared/grid.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/disasters.js";
import "../engine/traffic.js";
import "../engine/history.js";

const SIZE = 32;
const TERRACE = { x0: 12, y0: 12, x1: 19, y1: 15 };

/** A terrace of houses, with a fire station in range or none at all. */
function terrace(seed, { station }) {
  const state = createState(defaultOptions({ seed, width: SIZE, height: SIZE, seats: 1, disasters: false }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  state.population = 4000;
  let id = 500;
  for (let y = TERRACE.y0; y <= TERRACE.y1; y += 1) {
    for (let x = TERRACE.x0; x <= TERRACE.x1; x += 1) {
      const i = tileAt(state.width, x, y);
      state.tiles.zone[i] = 1;
      state.tiles.flags[i] |= FLAG_POWERED | FLAG_WATERED;
      id += 1;
      state.buildings.push({
        id, def: "res", zone: 1, x, y, w: 1, h: 1,
        level: 2, occupancy: 8, condition: 100, owner: 1,
      });
      state.tiles.buildingId[i] = id;
    }
  }
  if (station) {
    const i = tileAt(state.width, 16, 18);
    state.buildings.push({
      id: 900, def: "fireStation", zone: 0, x: 16, y: 18, w: 2, h: 2,
      level: 1, occupancy: 0, condition: 100, owner: 1,
    });
    for (let dy = 0; dy < 2; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) {
        const t = tileAt(state.width, 16 + dx, 18 + dy);
        state.tiles.buildingId[t] = 900;
        state.tiles.flags[t] |= FLAG_POWERED | FLAG_WATERED;
      }
    }
    void i;
  }
  // A month of ticks, so the civic pass computes the coverage and the fire risk
  // from what is actually standing.
  for (let t = 0; t < 14; t += 1) apply(state, { type: CMD_TICK });
  return state;
}

/** Ignites the middle of the terrace and runs until the fire is out. */
function burnDown(state) {
  const houses = state.buildings.filter((b) => b.def === "res").length;
  igniteAt(state, tileAt(state.width, 16, 13));
  let ticks = 0;
  for (; ticks < 400; ticks += 1) {
    apply(state, { type: CMD_TICK });
    let alight = 0;
    for (let i = 0; i < SIZE * SIZE; i += 1) if ((state.tiles.flags[i] & FLAG_BURNING) !== 0) alight += 1;
    if (alight === 0) break;
  }
  return { lost: houses - state.buildings.filter((b) => b.def === "res").length, ticks };
}

const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88, 99, 111, 222, 333, 444, 555, 666, 777, 888, 999, 1234, 4321];

function trials(station) {
  return SEEDS.map((seed) => burnDown(terrace(seed, { station })));
}

test("the unfought fire is data, and it burns longer and spreads harder than a fought one", () => {
  const fire = rules().fire;
  assert.ok(fire.unfoughtPercent > 0 && fire.unfoughtPercent <= 100,
    "no share of its own risk at which a fire counts as unfought");
  assert.ok(fire.unfoughtSpread > 1, "an unfought fire does not spread harder");
  assert.ok(fire.unfoughtDamage < fire.damagePerTick,
    "an unfought fire consumes its house as fast as a fought one, so it dies with it");
});

test("a fire nobody fights takes more than the house it started in", () => {
  // The whole point of A62. Not "sometimes": most of the time.
  const runs = trials(false);
  const spread = runs.filter((r) => r.lost > 1).length;
  const median = runs.map((r) => r.lost).sort((a, b) => a - b)[Math.floor(runs.length / 2)];
  assert.ok(spread >= 14, `only ${spread} of ${runs.length} fires reached a second house`);
  assert.ok(median >= 2, `the median unfought fire takes ${median} houses`);
});

test("a fire station in range stops it at the house it started in", () => {
  // And the difference has to be the STATION: same terrace, same seeds.
  const runs = trials(true);
  const spread = runs.filter((r) => r.lost > 1).length;
  const median = runs.map((r) => r.lost).sort((a, b) => a - b)[Math.floor(runs.length / 2)];
  assert.ok(spread <= 4, `${spread} of ${runs.length} covered fires spread anyway`);
  assert.ok(median <= 1, `the median covered fire takes ${median} houses`);
});

test("a covered fire is out sooner than an unfought one", () => {
  const covered = trials(true).map((r) => r.ticks).reduce((a, b) => a + b, 0) / SEEDS.length;
  const unfought = trials(false).map((r) => r.ticks).reduce((a, b) => a + b, 0) / SEEDS.length;
  assert.ok(unfought > covered * 1.5,
    `unfought fires last ${unfought.toFixed(1)} ticks against ${covered.toFixed(1)} covered`);
});

test("the same city burns the same way twice", () => {
  const a = burnDown(terrace(4242, { station: false }));
  const b = burnDown(terrace(4242, { station: false }));
  assert.deepEqual(a, b);
});

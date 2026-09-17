// The deputy lays roads near the town (slice B9, A81).
//
// The deputy is the AI mayor every headless gate plays with. It laid a street
// wherever its cursor wandered — a grid of empty roads across the river on the
// played city, which is D4's "the town has no edge" and the reason S2's fields
// had nowhere to be. A81: a road may be laid only within `roadReach` tiles of a
// lot that is built, or zoned and supplied; the grid grows outward with the
// town instead of ahead of it. Nothing is ever unpaved.

import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { makeDeputy, deputyTurn } from "../engine/deputy.js";
import { CMD_JOIN, CMD_TICK } from "../engine/commands.js";
import { TICKS_PER_YEAR, ZONE_NONE, ZONE_RESIDENTIAL, FLAG_RUINED } from "../engine/constants.js";
import { rules } from "../engine/rules.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/disasters.js";
import "../engine/traffic.js";
import "../engine/history.js";

function play(seed, size, years, doctrine = "expand") {
  const world = generateWorld(defaultOptions({ seed, width: size, height: size, seats: 1, waterStyle: "river" }));
  assert.ok(world.ok, `seed ${seed} did not generate`);
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Deputy" });
  const deputy = makeDeputy(1, doctrine);
  for (let tick = 1; tick <= years * TICKS_PER_YEAR; tick += 1) {
    apply(state, { type: CMD_TICK });
    if (tick % 6 === 0) deputyTurn(state, deputy);
  }
  return { state, deputy };
}

/** Steps from every tile to the nearest lot that is built or zoned, over the
 * four neighbours. At the END of a run: the rule asks for SUPPLIED zoning when
 * a road is laid, and a zone can lose its power or water long after — measured
 * against supply at the end, fifty roads on one seed looked stranded that were
 * laid by the rule. A road beyond reach of any zone or building is ahead of the
 * town, whatever happened since. */
function reachFromLots(state) {
  const { width: w, height: h } = state;
  const dist = new Int32Array(w * h).fill(-1);
  const queue = [];
  for (let i = 0; i < w * h; i += 1) {
    if (state.tiles.buildingId[i] !== 0 || state.tiles.zone[i] !== ZONE_NONE) { dist[i] = 0; queue.push(i); }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const i = queue[head];
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (dist[j] >= 0) continue;
      dist[j] = dist[i] + 1;
      queue.push(j);
    }
  }
  return dist;
}

const roadTiles = (state) => {
  const out = [];
  for (let i = 0; i < state.tiles.road.length; i += 1) if ((state.tiles.road[i] & 16) !== 0) out.push(i);
  return out;
};

test("the reach is data, and expand reaches a little further than the doctrines that hold back", () => {
  const reach = rules().deputy.roadReach;
  assert.equal(reach.balance, 3, "A81 starts at 3");
  assert.ok(reach.expand > reach.balance, "expand does not reach further than balance");
  assert.ok(reach.green >= 1);
});

test("no road the deputy lays is further than its reach from a lot that is built, or zoned and supplied", () => {
  // A road beyond reach is a street ahead of the town. Measured at the end of
  // the run, against the town as it stands then — a lot that burned down after
  // its road was laid could leave one stranded, and none should be further
  // than a couple of tiles past the rule.
  const reach = rules().deputy.roadReach.expand;
  for (const seed of [1003, 2026, 77]) {
    const { state } = play(seed, 48, 10);
    const dist = reachFromLots(state);
    const roads = roadTiles(state);
    assert.ok(roads.length > 20, `seed ${seed}: the deputy built ${roads.length} road tiles in ten years`);
    const far = roads.filter((i) => dist[i] < 0 || dist[i] > reach + 2);
    assert.equal(far.length, 0, `seed ${seed}: ${far.length} of ${roads.length} road tiles are beyond reach of the town`);
  }
});

test("a new city still starts: the first street needs no lot to be near", () => {
  // Before anything is zoned nothing qualifies, and a rule with no exception
  // for the first street is a deputy that never lays one.
  const { state } = play(1003, 48, 2);
  assert.ok(roadTiles(state).length > 0, "no road in two years");
  assert.ok(state.buildings.length > 0, "nothing built in two years");
});

test("a city still grows", () => {
  for (const seed of [1003, 2026, 77]) {
    const { state } = play(seed, 48, 12);
    let residents = 0;
    for (const b of state.buildings) if (b.zone === ZONE_RESIDENTIAL) residents += b.occupancy;
    assert.ok(residents > 150, `seed ${seed}: ${residents} residents after twelve years`);
  }
});

test("the deputy clears burnt ground inside its town, and zones it again", () => {
  // Nothing in a headless city had ever cleared a ruin — `clearRuin` has no
  // caller and bulldozing is the player's command — which cost nothing while a
  // fire took one house. With B1a's fire it is dead ground that development
  // skips forever: 36 tiles per city by year 25, before this.
  const { state, deputy } = play(1003, 48, 8);
  const ruined = [];
  // Burn a row of the town's own lots.
  for (let i = 0; i < state.tiles.flags.length; i += 1) {
    if (state.tiles.zone[i] === ZONE_NONE) continue;
    if (state.tiles.owner[i] !== 1) continue;
    state.tiles.buildingId[i] = 0;
    state.tiles.flags[i] |= FLAG_RUINED;
    ruined.push(i);
    if (ruined.length === 6) break;
  }
  assert.equal(ruined.length, 6, "the deputy's town has no zoned ground to burn");
  const zonesBefore = ruined.map((i) => state.tiles.zone[i]);

  for (let turn = 0; turn < 6; turn += 1) deputyTurn(state, deputy);

  const left = ruined.filter((i) => (state.tiles.flags[i] & FLAG_RUINED) !== 0);
  assert.equal(left.length, 0, `${left.length} of 6 burnt tiles are still ruins`);
  const rezoned = ruined.filter((i, k) => state.tiles.zone[i] === zonesBefore[k]);
  assert.ok(rezoned.length >= 5, `only ${rezoned.length} of 6 cleared tiles were zoned again`);
});

// The city four gates measure on (slices E1, E4; **played since H7, A105**).
//
// It used to be a grid of roads every four tiles with zoning between them and
// four hundred ticks — and nothing ever grew on it, because development wants
// power, water and demand the recipe never supplied. A fallback then pushed
// **1,129 copies of one `res` definition** straight into the array, so four
// gates measured "a mature city" on a monoculture with no shops, no industry
// and no residents (Q72).
//
// It plays the DEPUTY now: four mayors, forty years, roads and zoning and power
// and water decided by the same agent every sweep in this project is measured
// on. Measured before the change, on 128: 1,590 buildings of one kind and no
// commuter the reducer had ever routed. After: 1,245 buildings across eighteen
// kinds with 1,595 routed commuters, for 17.5 s a run against about one second.
//
// Two options survive as POST-FILTERS, because they are what a caller measures
// rather than what a city is:
//
//   buildings: false — the lane graph is derived from roads and E1's numbers
//     were taken before buildings existed (`lanes_dump`). The deputy's streets
//     stay; its lots go.
//   rail: false — the cost of the track is a before-and-after, and the "before"
//     has to be the code that ships (T3).
//   bridge: false — the same lever for S13's crossing, which is LAID here
//     rather than played: the deputy can cross a river since era 24 and in a
//     twenty-year 96 it never does, because that map's river is wider than
//     `build.bridgeSpan` nearly everywhere. A renderer gate measuring a city
//     with no bridge in it is a gate that cannot see the deck at all.
//
// The flat traffic seed stays an option too: a *load* is right for a renderer
// measurement and reproducible, which a simulated one is not (Q70).

import { generateWorld } from "../../engine/worldgen.js";
import { defaultOptions } from "../../engine/options.js";
import { apply } from "../../engine/reducer.js";
import { CMD_TICK, CMD_PLACE_ROAD, CMD_PLACE_RAIL, CMD_PLACE_BUILDING, CMD_BULLDOZE, CMD_PAINT_ZONE, CMD_JOIN } from "../../engine/commands.js";
// Imported for their side effects: `registerNetwork` runs at module load, and
// without it the reducer has no handler for `placeRoad`.
import "../../engine/build-commands.js";
import "../../engine/development.js";
// And `placeBuilding`, for T3's station. Without it the command is refused and
// the fixture comes back with a line and nothing on it — silently, because a
// refusal is a result code nobody was reading.
import "../../engine/utilities.js";
// The played city needs every monthly system the sweep runs, or it is a city
// that cannot catch fire, cannot congest and cannot go bankrupt — and the
// renderer gates would be pricing a place that does not happen.
import "../../engine/economy.js";
import "../../engine/civic.js";
import "../../engine/fire.js";
import "../../engine/disasters.js";
import "../../engine/traffic.js";
import "../../engine/history.js";
import { makeDeputy, deputyTurn } from "../../engine/deputy.js";
import { isWater, isBuildable } from "../../engine/terrain.js";
import { RESULT } from "../../shared/protocol.js";
import { encodeRuns, tileAt } from "../../shared/grid.js";
import { TICKS_PER_YEAR } from "../../engine/constants.js";
import { rules } from "../../engine/rules.js";

/** Takes buildings out of a played city and leaves the ground as it was: the
 * tiles stop pointing at a record that is gone, which is the half a caller
 * forgets. */
function removeBuildings(state, doomed) {
  const going = new Set(state.buildings.filter(doomed).map((b) => b.id));
  if (going.size === 0) return;
  state.buildings = state.buildings.filter((b) => !going.has(b.id));
  for (let i = 0; i < state.tiles.buildingId.length; i += 1) {
    if (going.has(state.tiles.buildingId[i])) state.tiles.buildingId[i] = 0;
  }
}


/** Lays ONE bridge across the narrowest water the city can reach (S13).
 *
 * The deputy will cross a river — `buildBlockAlong` spans one since S13 — but
 * it meets water fifteen times in a twenty-year city and a building on the far
 * bank refused every one of them, so **no city any renderer gate measures
 * contained a single road tile on water**. A deck nothing looks at is a deck
 * nobody can see a defect in, and this is the project's own rule: aim the shot
 * at the subject.
 *
 * Through the reducer, so it is a legal crossing charged at
 * `build.roadOverWater` and refused if `crossingRefusal` says no — a bridge the
 * harness drew into the tile array would prove nothing about the rule.
 */
function layBridge(state, seat = 1) {
  const W = state.width;
  const span = rules().build.bridgeSpan;
  const terrain = state.tiles.terrain;
  const APPROACH = 3;
  const free = (i) => isBuildable(terrain[i]) && state.tiles.buildingId[i] === 0
    && (state.tiles.owner[i] === 0 || state.tiles.owner[i] === seat);
  // Every candidate, not only the best one: a run can still be refused for a
  // reason this search does not model — J3's slope rule along the run, a tile
  // somebody owns — and a recipe that tries once throws away a whole fixture
  // when its first choice happens to be on a hillside (A120 did exactly that on
  // `hilly` 128 the moment the plinth rule moved the deputy's buildings).
  const candidates = [];
  // Both axes, because a river runs one way and the gate should not care.
  for (const horizontal of [true, false]) {
    const outer = horizontal ? state.height : W;
    const inner = horizontal ? W : state.height;
    for (let a = 0; a < outer; a += 1) {
      for (let b = 0; b < inner; b += 1) {
        const at = (k) => (horizontal ? tileAt(W, k, a) : tileAt(W, a, k));
        if (!isWater(terrain[at(b)]) || (b > 0 && isWater(terrain[at(b - 1)]))) continue;
        let wide = 0;
        while (b + wide < inner && isWater(terrain[at(b + wide)])) wide += 1;
        if (wide > span) continue;
        const from = b - APPROACH;
        const to = b + wide + APPROACH - 1;
        if (from < 0 || to >= inner) continue;
        const run = [];
        let ok = true;
        for (let k = from; k <= to && ok; k += 1) {
          const i = at(k);
          if (!isWater(terrain[i]) && !free(i)) ok = false;
          run.push(i);
        }
        if (!ok) continue;
        // Nearest to the existing streets wins, so the crossing is part of the
        // city rather than a corridor on its own in a field: the lane graph,
        // the walker and the traffic all follow the road it joins.
        let near = 0;
        for (const i of run) {
          for (const d of [-1, 1, -W, W]) {
            const j = i + d;
            if (j >= 0 && j < state.tiles.road.length && (state.tiles.road[j] & 16) !== 0) near += 1;
          }
        }
        const score = near * 100 - wide;
        candidates.push({ score, run });
      }
    }
  }
  if (candidates.length === 0) return { water: 0, reason: "no water narrow enough to bridge" };
  candidates.sort((a, b) => b.score - a.score);
  let last = "";
  for (const candidate of candidates.slice(0, 40)) {
    const placed = apply(state, { type: CMD_PLACE_ROAD, actor: seat, runs: encodeRuns(candidate.run) });
    if (placed.result !== RESULT.OK) { last = placed.result; continue; }
    let water = 0;
    for (const i of candidate.run) if (isWater(terrain[i])) water += 1;
    return { water, reason: "" };
  }
  return { water: 0, reason: `${candidates.length} crossings tried, the last refused ${last}` };
}

export function saturatedCity({ size = 96, seed = 1003, ticks = 20 * TICKS_PER_YEAR, buildings = true,
  traffic = -1, terrain = "rolling", rail = true, seats = 1, bridge = true } = {}) {
  // `terrain` because Q64 is a question about a `hilly` map and there was no way
  // to ask this recipe for one (D6).
  const world = generateWorld(defaultOptions({
    seed, width: size, height: size, seats, waterStyle: "river", terrainStyle: terrain,
  }));
  if (!world.ok) throw new Error(`generation failed: ${world.reason}`);
  const state = world.state;

  // ONE mayor and twenty years, which is the recipe closest in SIZE to the
  // fixture it replaces — and the size is what the gates were calibrated on.
  // Measured at H7 on a 96 map:
  //
  //   1 seat, 20 y    405 buildings, 18 kinds, pop 2,881, 1,243 corridors
  //   2 seats, 25 y   574                             3,411, 2,764
  //   4 seats, 40 y   642                             6,173, 5,946
  //   the grid it replaces   1,129 of ONE kind, no commuter ever routed, 773
  //
  // `lanes_dump` walks every point of every link and then runs three hundred
  // steps of traffic over it, so its cost follows the corridor count: at four
  // mayors it had not finished in thirteen minutes against a 110 s baseline.
  // More mayors are still available through `seats` for anyone who wants the
  // bigger city; the gates get the one they can afford to run.
  const deputies = [];
  for (let seat = 1; seat <= seats; seat += 1) {
    apply(state, { type: CMD_JOIN, actor: seat, seat, name: `Mayor ${seat}` });
    deputies.push(makeDeputy(seat, "expand"));
  }
  for (let tick = 1; tick <= ticks; tick += 1) {
    apply(state, { type: CMD_TICK });
    if (tick % 6 === 0) for (const deputy of deputies) deputyTurn(state, deputy);
  }

  const W = state.width;

  // One crossing, on purpose (S13): see `layBridge`. `bridge: false` is the
  // before-and-after, the same lever `rail` has.
  let bridged = 0;
  if (bridge) {
    const laid = layBridge(state);
    bridged = laid.water;
    if (bridged === 0) throw new Error(`a bridge was asked for and none was laid: ${laid.reason}`);
  }

  // `rail: false` — the line and its stations come out, so the cost of the
  // track stays a before-and-after against the code that ships (T3).
  if (!rail) {
    for (let i = 0; i < state.tiles.rail.length; i += 1) state.tiles.rail[i] = 0;
    removeBuildings(state, (b) => b.def === "railStation");
  }

  // `buildings: false` — the streets stay and the lots go, which is what a lane
  // graph is derived from (`lanes_dump`, E1).
  if (!buildings) removeBuildings(state, () => true);

  // The commuter load, seeded rather than simulated. The buildings above are
  // pushed straight into the array with no zoning demand behind them, so the
  // reducer never routes a commute and `state.tiles.traffic` stays zero — which
  // is how the first perf-card run measured a saturated city with no moving car
  // in it (D1). `lanes_dump` has seeded 200 on every road tile since E4; this is
  // the same load through the same recipe.
  if (traffic >= 0) {
    for (let i = 0; i < state.tiles.road.length; i += 1) {
      if (state.tiles.road[i] & 16) state.tiles.traffic[i] = traffic;
    }
  }

  let paved = 0;
  for (let i = 0; i < state.tiles.road.length; i += 1) if (state.tiles.road[i] & 16) paved += 1;
  if (paved === 0) throw new Error("no road was built");
  let track = 0;
  for (let i = 0; i < state.tiles.rail.length; i += 1) if (state.tiles.rail[i] & 16) track += 1;
  // A city that never grew big enough for a line is a young city, not a broken
  // fixture: the deputy lays one past `deputy.railAtPopulation` and not before.
  // The throw is for the case that used to happen silently — a line asked for,
  // a city old enough to have one, and no track anywhere (S11's rock).
  if (rail && track === 0 && state.population >= rules().deputy.railAtPopulation) {
    throw new Error(`a rail line was asked for, the city is ${state.population} strong and none was laid`);
  }
  // `buildings: false` is `lanes_dump`'s contract — a lane graph derived from
  // roads and nothing else — so the line goes down without a station on it.
  if (rail && buildings && track > 0 && !state.buildings.some((b) => b.def === "railStation")) {
    throw new Error("a rail line was laid and no station stands on it");
  }
  return { state, paved, track, bridged };
}

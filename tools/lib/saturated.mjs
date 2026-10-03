// The saturated city three gates measure on (slices E1, E4).
//
// A grid every four tiles with zoning between it, four hundred ticks of
// growth, on a GENERATED world — `createState` leaves every tile at terrain 0
// with no elevation and the reducer refuses to build on it. Extracted from
// `lanes_dump.mjs` when `walkthrough` and `passability` needed the same city:
// three copies of a fixture recipe is three chances for a gate to be measuring
// a different place from the one it reports.

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

export function saturatedCity({ size = 96, seed = 1003, ticks = 400, buildings = true,
  traffic = -1, terrain = "rolling", rail = true } = {}) {
  // `terrain` because Q64 is a question about a `hilly` map and there was no way
  // to ask this recipe for one (D6). The default is what every gate before D6
  // measured on, so nothing re-baselines.
  const world = generateWorld(defaultOptions({
    seed, width: size, height: size, waterStyle: "river", terrainStyle: terrain,
  }));
  if (!world.ok) throw new Error(`generation failed: ${world.reason}`);
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Surveyor" });
  state.players[0].treasury = 90000000;

  const W = state.width;
  // `placeNetwork` refuses water and ROCK, and a command that touches one tile
  // of either is refused whole — which on seed 1003 is most of them.
  //
  // Rock was missing from this predicate until S11, and nothing noticed while
  // the gates ran on `rolling`, which has almost none. On `hilly` 128 the rail
  // row carries **12 rock tiles**, so every run of the line was refused and
  // `saturatedCity` threw "a rail line was asked for and none was laid" — the
  // gate this fixture exists for could not be run on the terrain the question
  // was about (Q64/Q74).
  const land = (x, y) => {
    const t = state.tiles.terrain[y * W + x];
    return t !== 3 && t !== 4 && t !== 5;   // WATER, SHALLOW, ROCK
  };
  const paveLine = (tiles) => {
    let start = -1;
    for (let k = 0; k <= tiles.length; k += 1) {
      const dry = k < tiles.length && land(tiles[k][0], tiles[k][1]);
      if (dry && start < 0) start = k;
      if (!dry && start >= 0) {
        const [x, y] = tiles[start];
        apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: [y * W + x, k - start] });
        start = -1;
      }
    }
  };
  for (let y = 8; y < W - 8; y += 4) {
    paveLine(Array.from({ length: W - 16 }, (_, k) => [8 + k, y]));
  }
  for (let x = 8; x < W - 8; x += 4) {
    for (let y = 8; y < W - 8; y += 1) if (land(x, y)) apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: [y * W + x, 1] });
  }
  for (let y = 9; y < W - 9; y += 4) {
    for (let x = 9; x < W - 9; x += 1) {
      if (land(x, y)) apply(state, { type: CMD_PAINT_ZONE, actor: 1, runs: [y * W + x, 1], zone: ((y / 4) | 0) % 3 + 1 });
    }
  }
  for (let i = 0; i < ticks; i += 1) apply(state, { type: CMD_TICK });

  // Nothing DEVELOPS without power and water, so the grid alone has no
  // buildings and therefore no lots — and a walkthrough of a city with nothing
  // to bump into is a walkthrough of a field. Seeded directly, the way
  // `budget_gate` does and for the same reason.
  if (buildings && state.buildings.length === 0) {
    let id = 1;
    for (let y = 10; y < W - 10; y += 1) {
      for (let x = 10; x < W - 10; x += 1) {
        if ((state.tiles.road[y * W + x] & 16) !== 0) continue;
        if ((x + y) % 3 !== 0) continue;
        state.buildings.push({
          id, def: "res", zone: 1, x, y, w: 1, h: 1, owner: 1,
          level: 2, valueTier: 1, occupancy: 20, condition: 100, builtTick: 0, flags: 0,
        });
        state.tiles.buildingId[y * W + x] = id;
        id += 1;
      }
    }
    state.nextId = id;
  }

  // A LINE and a station (T3), because a fixture with no railway on it prices a
  // renderer that has one. Straight across the map on a row the grid does not
  // use, so it makes level crossings with every north-south street it meets —
  // which is the geometry the crossing pass is for. `rail` is refused over
  // water and over a building, so it goes down in dry runs like the roads.
  if (rail) {
    // Through the MIDDLE of the map, on a row the grid does not use (the roads
    // are every fourth row from 8, the zoning every fourth from 9). At row 15
    // the line was outside every chunk `budget_gate` bakes and the triangle
    // count came back identical to the run with no railway in the fixture at
    // all — a fixture that has the thing and never shows it to the instrument.
    let row = 15;
    for (let y = Math.floor(W / 2) - 8; y < Math.floor(W / 2) + 8; y += 1) {
      if (y % 4 === 3) { row = y; break; }
    }
    // The houses on the row come DOWN first. Dodging them instead chopped the
    // line into eighteen fragments — every third tile of a plain row carries
    // one — so the longest "line" in the fixture was ten tiles, none of it in
    // the chunks `budget_gate` bakes, and the track cost exactly zero
    // triangles in a fixture that was supposed to price it.
    for (let x = 0; x < W; x += 1) {
      const tile = row * W + x;
      const id = state.tiles.buildingId[tile];
      if (id === 0) continue;
      const k = state.buildings.findIndex((b) => b.id === id);
      if (k >= 0) state.buildings.splice(k, 1);
      state.tiles.buildingId[tile] = 0;
    }
    const runs = [];
    let start = -1;
    for (let x = 0; x <= W; x += 1) {
      const clear = x < W && land(x, row);
      if (clear && start < 0) start = x;
      if (!clear && start >= 0) {
        runs.push([start, x - start]);
        start = -1;
      }
    }
    let laid = 0;
    for (const [x, len] of runs) {
      if (apply(state, { type: CMD_PLACE_RAIL, actor: 1, runs: [row * W + x, len] }).result === "ok") laid += len;
    }
    // Say what was refused rather than leaving the count to the check below: a
    // line in four pieces is a fixture worth knowing about, and a line in none
    // used to arrive as a bare throw forty lines later.
    if (laid === 0 && runs.length > 0) {
      throw new Error(`every rail run on row ${row} was refused (${runs.length} runs, `
        + `${runs.reduce((n, [, len]) => n + len, 0)} tiles) — something on that row refuses a network`);
    }
    // And a station beside it, on a footprint that touches NO ROAD.
    //
    // The houses in its way are bulldozed, which is what a player does; the
    // roads are not, which is what the first cut did — it cleared four tiles
    // out of a road row, the lane graph re-derived around the hole, and
    // `walkthrough` reported **128 cliffs** where the walker climbed the
    // station it was now walking through. The grid here is a road every four
    // rows and every four columns, so the two rows ABOVE the line are clear of
    // road rows and a footprint starting at x ≡ 1 (mod 4) is clear of road
    // columns.
    // The two rows ABOVE the line are clear of the grid's road rows, and a
    // footprint at x ≡ 1 (mod 4) is clear of its road columns — so the only
    // thing in the way is the seeded housing, and a third of every row has
    // some. It is removed the same way it was put there: `bulldoze` clears a
    // network and a zone, not a building, and this recipe pushed these
    // straight into the array.
    //
    // The first cut cleared ROAD tiles instead. The lane graph re-derived
    // around the hole, the lanes ran through the new station, and
    // `walkthrough` reported 128 cliffs where the walker climbed it.
    let stood = false;
    for (let x = 13; buildings && !stood && x < W - 12; x += 4) {
      const foot = [];
      let ok = true;
      for (let dy = -2; dy <= -1 && ok; dy += 1) {
        for (let dx = 0; dx < 3 && ok; dx += 1) {
          const tile = (row + dy) * W + x + dx;
          if (!land(x + dx, row + dy) || (state.tiles.road[tile] & 16) !== 0) ok = false;
          else foot.push(tile);
        }
      }
      if (!ok) continue;
      for (const tile of foot) {
        const id = state.tiles.buildingId[tile];
        if (id === 0) continue;
        const k = state.buildings.findIndex((b) => b.id === id);
        if (k >= 0) state.buildings.splice(k, 1);
        state.tiles.buildingId[tile] = 0;
      }
      for (const tile of foot) apply(state, { type: CMD_BULLDOZE, actor: 1, runs: [tile, 1] });
      stood = apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x, y: row - 2, def: "railStation" }).result === "ok";
    }
  }

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
  if (rail && track === 0) throw new Error("a rail line was asked for and none was laid");
  // `buildings: false` is `lanes_dump`'s contract — a lane graph derived from
  // roads and nothing else — so the line goes down without a station on it.
  if (rail && buildings && !state.buildings.some((b) => b.def === "railStation")) {
    throw new Error("a rail line was laid and no station stands on it");
  }
  return { state, paved, track };
}

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
import { CMD_TICK, CMD_PLACE_ROAD, CMD_PAINT_ZONE, CMD_JOIN } from "../../engine/commands.js";
// Imported for their side effects: `registerNetwork` runs at module load, and
// without it the reducer has no handler for `placeRoad`.
import "../../engine/build-commands.js";
import "../../engine/development.js";

export function saturatedCity({ size = 96, seed = 1003, ticks = 400, buildings = true } = {}) {
  const world = generateWorld(defaultOptions({ seed, width: size, height: size, waterStyle: "river" }));
  if (!world.ok) throw new Error(`generation failed: ${world.reason}`);
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Surveyor" });
  state.players[0].treasury = 90000000;

  const W = state.width;
  // `placeNetwork` refuses water, and a command that touches one tile of river
  // is refused whole — which on seed 1003 is most of them.
  const land = (x, y) => {
    const t = state.tiles.terrain[y * W + x];
    return t !== 3 && t !== 4;   // WATER, SHALLOW
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

  let paved = 0;
  for (let i = 0; i < state.tiles.road.length; i += 1) if (state.tiles.road[i] & 16) paved += 1;
  if (paved === 0) throw new Error("no road was built");
  return { state, paved };
}

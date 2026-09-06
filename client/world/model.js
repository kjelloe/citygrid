// The city model: everything cityviewer derives from state, in metres.
//
// Pure — no three.js — and rebuilt whole when the world changes. It reads
// state and remembers nothing that is not a function of it (ruling 032), so a
// discarded model and a rebuilt one are the same model. Chunked rebuilds keyed
// by a content hash arrive with the baker (E2); a full derivation of a 128×128
// region is a few milliseconds and does not need them yet.

import { deriveCorridors } from "./corridors.js";
import { createGround } from "./ground.js";
import { deriveLots } from "./lots.js";
import { deriveLanes } from "./lanes.js";
import { getConfig } from "./config.js";
import { TERRAIN_WATER, TERRAIN_SHALLOW } from "../constants-mirror.js";

export function createModel(state) {
  const cfg = getConfig();
  const network = deriveCorridors(state, "road");
  const ground = createGround(state, network);
  const lots = deriveLots(state, network, ground);
  // The board traffic is played on (E1, ruling 037). Derived like everything
  // else here — a discarded lane graph and a rebuilt one are the same graph.
  const lanes = deriveLanes(state, network, ground.heightAt);

  /** What is underfoot: `{ kind, y, corridor?, node?, lot?, dist }`.
   *
   * `y` is the surface the walker's feet are ON, which is not the height field:
   * E3 lays the carriageway `road.lift` above it and the pavement a kerb higher
   * again, so a walker reading `heightAt` alone would sink through the kerb it
   * can see (spec §5.2, and what E4's `floorAt` steps up). */
  function surfaceAt(x, z) {
    const tile = ground.tileOf(x, z);
    if (tile >= 0) {
      const t = state.tiles.terrain[tile];
      if (t === TERRAIN_WATER || t === TERRAIN_SHALLOW) return { kind: "water", y: ground.heightAt(x, z), dist: 0 };
    }
    const lot = lots.lotAt(x, z);
    if (lot) return { kind: "lot", y: ground.heightAt(x, z), lot, dist: 0 };
    const near = network.nearest(x, z);
    const base = ground.heightAt(x, z);
    if (near && near.dist <= network.half) return { ...near, kind: "road", y: base + cfg.road.lift };
    if (near && near.dist <= network.frontage) {
      return { ...near, kind: "sidewalk", y: base + cfg.road.lift + cfg.road.kerb };
    }
    return { kind: "ground", y: base, dist: near ? near.dist : Infinity };
  }

  return {
    tileM: cfg.tileM,
    reliefM: cfg.reliefM,
    corridors: network.corridors,
    nodes: network.nodes,
    connectors: network.connectors,
    nearestCorridor: network.nearest,
    heightAt: ground.heightAt,
    cornerHeightAt: ground.cornerHeightAt,
    landAt: ground.landAt,
    normalAt: ground.normalAt,
    waterLevel: ground.waterLevel,
    minHeight: ground.minHeight,
    maxHeight: ground.maxHeight,
    lots: lots.lots,
    lotOf: (id) => lots.byId.get(id),
    lotAt: lots.lotAt,
    lanes,
    surfaceAt,
    stats: {
      corridors: network.corridors.length, nodes: network.nodes.length,
      connectors: network.connectors.length, lots: lots.lots.length,
      links: lanes.stats.links, turns: lanes.stats.turns, signals: lanes.stats.signals,
    },
  };
}

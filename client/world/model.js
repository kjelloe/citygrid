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
import { getConfig } from "./config.js";
import { TERRAIN_WATER, TERRAIN_SHALLOW } from "../constants-mirror.js";

export function createModel(state) {
  const cfg = getConfig();
  const network = deriveCorridors(state, "road");
  const ground = createGround(state, network);
  const lots = deriveLots(state, network, ground);

  /** What is underfoot: `{ kind, corridor?, node?, lot?, dist }`. */
  function surfaceAt(x, z) {
    const tile = ground.tileOf(x, z);
    if (tile >= 0) {
      const t = state.tiles.terrain[tile];
      if (t === TERRAIN_WATER || t === TERRAIN_SHALLOW) return { kind: "water", dist: 0 };
    }
    const lot = lots.lotAt(x, z);
    if (lot) return { kind: "lot", lot, dist: 0 };
    const near = network.nearest(x, z);
    if (near && near.dist <= network.half) return { kind: "road", ...near };
    if (near && near.dist <= network.frontage) return { kind: "sidewalk", ...near };
    return { kind: "ground", dist: near ? near.dist : Infinity };
  }

  return {
    tileM: cfg.tileM,
    reliefM: cfg.reliefM,
    corridors: network.corridors,
    nodes: network.nodes,
    connectors: network.connectors,
    nearestCorridor: network.nearest,
    heightAt: ground.heightAt,
    landAt: ground.landAt,
    normalAt: ground.normalAt,
    waterLevel: ground.waterLevel,
    lots: lots.lots,
    lotOf: (id) => lots.byId.get(id),
    lotAt: lots.lotAt,
    surfaceAt,
    stats: { corridors: network.corridors.length, nodes: network.nodes.length, connectors: network.connectors.length, lots: lots.lots.length },
  };
}

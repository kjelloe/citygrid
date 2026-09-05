// Lots and frontages (specs/engine/04-city-model.md §4.4).
//
// A building record is a rectangle in tiles. Its lot is that rectangle in
// metres, inset by a setback the zone decides — a shop stands on the pavement,
// a house behind a garden — and its FRONTAGE is the edge that faces a road.
// The frontage is what the facade grammar builds against and where the nav
// graph attaches the door; a lot with no road beside it faces the nearest
// corridor, and one with no corridor at all faces north and says so.

import { DIR4, tileAt, inBounds } from "../../shared/grid.js";
import { NET_PRESENT } from "../constants-mirror.js";
import { getConfig } from "./config.js";
import { jitter } from "./hash.js";
import { zoneKey } from "./params.js";

/** Road tiles along the outside of one side of a building, in DIR4 order. */
function roadsBeside(state, b, side) {
  const road = state.tiles.road;
  let count = 0;
  const along = side === 0 || side === 2 ? b.w : b.h;
  for (let k = 0; k < along; k += 1) {
    const x = side === 0 || side === 2 ? b.x + k : (side === 1 ? b.x + b.w : b.x - 1);
    const y = side === 1 || side === 3 ? b.y + k : (side === 2 ? b.y + b.h : b.y - 1);
    if (!inBounds(state.width, state.height, x, y)) continue;
    if (road[tileAt(state.width, x, y)] & NET_PRESENT) count += 1;
  }
  return count;
}

function sideTowards(dx, dz) {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 1 : 3;
  return dz > 0 ? 2 : 0;
}

export function deriveLots(state, network, ground) {
  const cfg = getConfig();
  const tileM = cfg.tileM;
  const lots = [];
  const byId = new Map();
  for (const b of state.buildings) {
    const key = zoneKey(b.zone);
    const setback = cfg.lot.setback[key];
    const x0 = b.x * tileM + setback;
    const z0 = b.y * tileM + setback;
    const x1 = (b.x + b.w) * tileM - setback;
    const z1 = (b.y + b.h) * tileM - setback;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;

    const counts = DIR4.map((_, side) => roadsBeside(state, b, side));
    const best = Math.max(...counts);
    let frontage;
    let facing = true;
    if (best > 0) {
      const tied = counts.map((c, side) => (c === best ? side : -1)).filter((s) => s >= 0);
      frontage = tied[Math.floor(jitter(b.id, 61) * tied.length) % tied.length];
    } else {
      const near = network.nearest(cx, cz, Infinity);
      if (near) frontage = sideTowards(near.x - cx, near.z - cz);
      else { frontage = 0; facing = false; }
    }
    const frontageLen = frontage === 0 || frontage === 2 ? x1 - x0 : z1 - z0;
    const bays = Math.max(1, Math.round(frontageLen / cfg.lot.bayW[key]));
    const seat = Math.min(
      ground.heightAt(x0, z0), ground.heightAt(x1, z0),
      ground.heightAt(x0, z1), ground.heightAt(x1, z1),
    );
    const lot = { id: b.id, building: b, x0, z0, x1, z1, cx, cz, frontage, facing, frontageLen, bays, seat };
    lots.push(lot);
    byId.set(b.id, lot);
  }

  function lotAt(x, z) {
    const tx = Math.floor(x / tileM);
    const ty = Math.floor(z / tileM);
    if (!inBounds(state.width, state.height, tx, ty)) return undefined;
    const id = state.tiles.buildingId[tileAt(state.width, tx, ty)];
    if (id === 0) return undefined;
    const lot = byId.get(id);
    if (!lot) return undefined;
    return x >= lot.x0 && x <= lot.x1 && z >= lot.z0 && z <= lot.z1 ? lot : undefined;
  }

  return { lots, byId, lotAt };
}

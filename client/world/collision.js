// What a walker can stand on and cannot walk through (slice E4; spec §8.1).
//
// Pure, and in `client/world/` rather than beside the camera that drives it,
// because every way a street camera goes wrong is arithmetic: through a wall,
// stuck on a corner, a foot above the pavement, unable to step up a kerb. None
// of that fails a render and all of it fails an assertion.
//
// The colliders are the lots — the same rectangles `lots.js` derives for the
// facades, so what you can see is what you can bump into.

import { getConfig } from "./config.js";
import { storeys, zoneKey, kindOf } from "./params.js";
import { frontEdgeOf } from "./lots.js";
import { lampsAlong, lampOffset, furnitureBoxes } from "./street-furniture.js";

/** Hash cell, metres. Eight is half a carriageway and smaller than a lot, so a
 * query touches four cells and a 40 m frontage is not in twenty of them. */
export const CELL = 8;

/** How far up a walker may step without it being a wall. A kerb is 0.15 m and
 * a doorstep is less; 0.6 m is a low garden wall, which should stop them. */
const STEP_UP = 0.6;

const key = (cx, cz) => `${cx},${cz}`;

/**
 * A lot as a solid box, seated on its own ground.
 *
 * A BOX and not four wall segments, which is what this was first: a segment
 * push-out has no idea which side of itself it is on, so a walker a handful of
 * centimetres inside a building came out further inside it. A rectangle knows
 * its own inside, and a lot is always one.
 */
function boxOf(lot, id) {
  const cfg = getConfig();
  const height = storeys(lot.building) * cfg.lot.floorH[zoneKey(lot.building.zone)];
  return {
    id, kind: "lot", lot: lot.id,
    x0: lot.x0, z0: lot.z0, x1: lot.x1, z1: lot.z1,
    yBase: lot.seat, yTop: lot.seat + height,
  };
}

/** How far, and in which direction, to move a circle at (x, z) out of `b`. */
function pushOut(b, x, z, r) {
  const cx = Math.max(b.x0, Math.min(b.x1, x));
  const cz = Math.max(b.z0, Math.min(b.z1, z));
  if (cx !== x || cz !== z) {
    // Outside: the nearest point on the box is on its boundary.
    const dist = Math.hypot(x - cx, z - cz);
    if (dist >= r) return undefined;
    if (dist < 1e-9) return { x: cx, z: cz + r };
    const scale = r / dist;
    return { x: cx + (x - cx) * scale, z: cz + (z - cz) * scale };
  }
  // Inside: out through the nearest face, which is the shortest way to daylight.
  const west = x - b.x0;
  const east = b.x1 - x;
  const north = z - b.z0;
  const south = b.z1 - z;
  const least = Math.min(west, east, north, south);
  if (least === west) return { x: b.x0 - r, z };
  if (least === east) return { x: b.x1 + r, z };
  if (least === north) return { x, z: b.z0 - r };
  return { x, z: b.z1 + r };
}

/** The street furniture, as boxes (slice E7, A43).
 *
 * From the same functions the geometry is built from, which is why they moved
 * into `client/world/`: a lamp placed by one rule and collided by another is a
 * lamp you walk through standing beside one you cannot. Bins are deliberately
 * absent — A43 names lamps and hedges.
 */
function furnitureOf(model) {
  const cfg = getConfig();
  const offset = lampOffset(cfg);
  const lamps = [];
  for (const corridor of model.corridors) {
    for (const lamp of lampsAlong(
      corridor.points, offset, cfg.props.lampSpacing, cfg.props.lampH, model.heightAt,
    )) lamps.push(lamp);
  }
  const fronts = model.lots
    .filter((lot) => kindOf(lot.building.zone) === "residential")
    .map(frontEdgeOf);
  return furnitureBoxes(model, lamps, fronts);
}

/**
 * The collision world for one city model.
 *
 * `boxes` may be supplied instead of derived, which is what lets a test stand
 * two walls a known distance apart and ask whether a walker fits between them.
 */
export function createCollision(model, boxes) {
  const solids = boxes ?? [
    ...model.lots.map((lot, i) => boxOf(lot, i)),
    ...furnitureOf(model),
  ];
  const grid = new Map();
  for (const b of solids) {
    const cx0 = Math.floor(b.x0 / CELL);
    const cx1 = Math.floor(b.x1 / CELL);
    const cz0 = Math.floor(b.z0 / CELL);
    const cz1 = Math.floor(b.z1 / CELL);
    for (let cz = cz0; cz <= cz1; cz += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) {
        const k = key(cx, cz);
        const cell = grid.get(k);
        if (cell) cell.push(b); else grid.set(k, [b]);
      }
    }
  }

  /** Every box whose cell is within `radius` of the point. A superset of the
   * boxes actually within it — the caller measures. */
  function near(x, z, radius) {
    const cx0 = Math.floor((x - radius) / CELL);
    const cx1 = Math.floor((x + radius) / CELL);
    const cz0 = Math.floor((z - radius) / CELL);
    const cz1 = Math.floor((z + radius) / CELL);
    const out = [];
    const seen = new Set();
    for (let cz = cz0; cz <= cz1; cz += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) {
        for (const b of grid.get(key(cx, cz)) ?? []) {
          if (seen.has(b.id)) continue;
          seen.add(b.id);
          out.push(b);
        }
      }
    }
    return out;
  }

  /**
   * The surface at (x, z), or `undefined` when it is too far above `footY` to
   * be a step. Down is always allowed: that is a drop, and gravity handles it.
   */
  function floorAt(x, z, footY) {
    const y = model.surfaceAt(x, z).y;
    if (footY !== undefined && y - footY > STEP_UP) return undefined;
    return y;
  }

  /**
   * Pushes a walker of radius `r` and height `h` out of anything it is inside.
   *
   * Twice, because one pass solves one box and can leave the walker inside a
   * neighbour. Twice and not until-clean: a walker wedged between two solids
   * closer together than its diameter should be stopped, not ejected through
   * one of them.
   */
  function resolve(pos, r = 0.34, h = 1.7) {
    let x = pos.x;
    let z = pos.z;
    let hit = false;
    for (let pass = 0; pass < 2; pass += 1) {
      for (const b of near(x, z, r)) {
        // A solid the walker is over or under is not a wall to the walker.
        if (b.yTop <= pos.y || b.yBase >= pos.y + h) continue;
        const out = pushOut(b, x, z, r);
        if (!out) continue;
        hit = true;
        x = out.x;
        z = out.z;
      }
    }
    return { x, z, hit };
  }

  return { solids, near, floorAt, resolve, stepUp: STEP_UP };
}

// Signal heads and crossings (slice V8; spec §9.2, A33).
//
// Cars have stopped at invisible lights since E1: `phaseAt` decides the cycle
// and `ahead()` treats a red as a wall, so the player watches a queue form at a
// junction with nothing standing at it — which reads as a jam rather than as a
// light, and is most of what makes traffic look broken instead of alive.
//
// Two pieces, and only one of them can be baked. A HEAD is geometry — a post at
// the kerb with a housing on it — and goes into the chunk with everything else.
// Its LENS is not: it changes three times a minute, so it is an instance
// coloured per frame from the same `phaseAt` the cars read. Two sources of truth
// about which way is green is a car driving through a red one.
//
// Pure, in `client/world/`, so where a head stands and which way a bar runs are
// assertions rather than a screenshot somebody squints at.

import { DIR4 } from "../../shared/grid.js";
import { getConfig } from "./config.js";

const AXIS = ["ns", "ew", "ns", "ew"];   // DIR4 order: N, E, S, W

/** How tall a signal post is, and how far its lens hangs above the kerb. */
const POST_H = 3.2;

/** Which arm of a node a point lies on, in DIR4 order. */
function armOf(node, x, z) {
  let best = 0;
  let bestDot = -Infinity;
  const len = Math.hypot(x - node.x, z - node.z) || 1;
  for (let d = 0; d < 4; d += 1) {
    const dot = DIR4[d].dx * ((x - node.x) / len) + DIR4[d].dy * ((z - node.z) / len);
    if (dot > bestDot) { bestDot = dot; best = d; }
  }
  return best;
}

/** Where each arm leaves a node: a unit vector per corridor meeting it. */
function armsOf(model, node) {
  const out = [];
  for (const id of node.corridors) {
    const corridor = model.corridors[id];
    if (!corridor) continue;
    // The corridor's first point away from this node — a corridor may run in
    // either direction, so take whichever end is not the node itself.
    const a = corridor.points[0];
    const b = corridor.points[corridor.points.length - 1];
    const from = Math.hypot(a.x - node.x, a.z - node.z) < Math.hypot(b.x - node.x, b.z - node.z) ? a : b;
    const to = from === a ? corridor.points[1] ?? b : corridor.points[corridor.points.length - 2] ?? a;
    const dx = to.x - node.x;
    const dz = to.z - node.z;
    const len = Math.hypot(dx, dz) || 1;
    out.push({ corridor: corridor.id, x: dx / len, z: dz / len });
  }
  return out;
}

/**
 * A signal head per approach at a signalled junction.
 *
 * On the kerb, on the near right of the arm — where a driver arriving on it
 * looks — and back at the junction box's edge, which is far enough that the
 * head is not inside the carriageway it is stopping.
 */
export function signalHeads(model, node, cfg = getConfig()) {
  if (!node || !model.lanes.signals.has(node.id)) return [];
  const half = cfg.road.width / 2;
  const box = half + cfg.road.sidewalk;
  const kerb = half + cfg.road.sidewalk / 2;
  const out = [];
  for (const arm of armsOf(model, node)) {
    // Right of the arm, in a y-up world where +x is east and +z south.
    const rx = -arm.z;
    const rz = arm.x;
    const x = node.x + arm.x * box + rx * kerb;
    const z = node.z + arm.z * box + rz * kerb;
    out.push({
      node: node.id,
      corridor: arm.corridor,
      axis: AXIS[armOf(node, node.x + arm.x, node.z + arm.z)],
      x,
      z,
      h: POST_H,
      // Facing back down the arm, at whoever is arriving on it.
      fx: -arm.x,
      fz: -arm.z,
    });
  }
  return out;
}

/** How many bars a zebra has, and how wide each one is. */
const BARS = 3;
const BAR_W = 0.5;

/**
 * The bars of a crossing, across each approach at a signalled junction.
 *
 * Each is two points in metres, running ACROSS the carriageway — the caller
 * turns them into ribbons. Painted only where there is a light, because a zebra
 * with nothing to stop the traffic is a lie about who has right of way.
 */
export function crossingBars(model, node, cfg = getConfig()) {
  if (!node || !model.lanes.signals.has(node.id)) return [];
  const half = cfg.road.width / 2;
  const box = half + cfg.road.sidewalk;
  const out = [];
  for (const arm of armsOf(model, node)) {
    const rx = -arm.z;
    const rz = arm.x;
    // Just outside the junction box, where the lane graph's stop line is.
    const along = box + cfg.road.stopLine;
    for (let i = 0; i < BARS; i += 1) {
      const step = (i - (BARS - 1) / 2) * (BAR_W * 2.2);
      const cx = node.x + arm.x * (along + step);
      const cz = node.z + arm.z * (along + step);
      out.push({
        kind: "zebra",
        width: BAR_W,
        points: [
          { x: cx - rx * half, z: cz - rz * half },
          { x: cx + rx * half, z: cz + rz * half },
        ],
      });
    }
  }
  return out;
}

/** The three lenses, and which one is lit.
 *
 * `phase` is exactly what `lanes.phaseAt` returns, so there is one answer to
 * "which way is green" and both the cars and the lights read it.
 */
export function lensColour(phase, axis) {
  if (phase === "amber") return { name: "amber", hex: 0xffb020 };
  return phase === axis ? { name: "green", hex: 0x39d15a } : { name: "red", hex: 0xe03a30 };
}

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
import { FLAG_RUINED } from "../constants-mirror.js";
import { frontEdgeOf, OUTWARD } from "./lots.js";
import { doorPoint } from "./street-furniture.js";

const AXIS = ["ns", "ew", "ns", "ew"];   // DIR4 order: N, E, S, W

/** How tall a signal post is, and how far its lens hangs above the kerb. */
const POST_H = 3.2;

/** How long a corridor has to be to count as a street rather than a stub. One
 * tile: a driveway between two roads is not a street, and a light that stops an
 * arterial for one is worse than no light. */
const STREET_TILES = 1;

/**
 * Is this node a crossing of two real streets? (slice T1, A51.)
 *
 * E1 signalled every node of kind `junction`, which is every node of degree
 * three or more. V8 drew the heads and showed what that means on an ordinary
 * city grid: a picket fence of traffic lights, four to a junction, every two to
 * four tiles (Q67). Kjell's answer: signals only where two real streets cross —
 * two corridors of more than one tile each, meeting here. Everything else is
 * give-way, and the through road holds priority.
 *
 * ONE function, asked by the lane graph (which owns the cycle), the heads that
 * stand at it (V8) and the nav graph's crossings (E7). Three copies of the rule
 * is a light standing at a junction the cars drive straight through.
 */
export function isSignalled(node, corridors, cfg = getConfig()) {
  // FOUR arms, and a real street on each axis. Three is a T, and a T is
  // give-way: the through road holds priority and the stem waits for a gap.
  if (!node || node.kind !== "junction" || node.degree < 4) return false;
  const streets = { ns: 0, ew: 0 };
  for (const id of node.corridors) {
    const corridor = corridors[id];
    if (!corridor) continue;
    // By LENGTH, not by tile count: a corridor's `tiles` include the junction
    // tiles at either end, so a one-tile stub between two roads counts three.
    if (corridor.length <= STREET_TILES * cfg.tileM + 1e-6) continue;
    streets[axisOfArm(node, corridor)] += 1;
  }
  return streets.ns > 0 && streets.ew > 0;
}

/** Which axis an arm leaves a node on. */
function axisOfArm(node, corridor) {
  const a = corridor.points[0];
  const b = corridor.points[corridor.points.length - 1];
  const near = Math.hypot(a.x - node.x, a.z - node.z) < Math.hypot(b.x - node.x, b.z - node.z) ? a : b;
  const next = near === a ? (corridor.points[1] ?? b) : (corridor.points[corridor.points.length - 2] ?? a);
  return AXIS[armOf(node, next.x, next.z)];
}

/**
 * Which axis holds priority at an unsignalled junction, or `undefined` when the
 * rule cannot say (T1, A51).
 *
 * The THROUGH road, and the first test is the number of ARMS. A junction splits
 * the road that runs through it into two corridors, one either side, while the
 * road that ends there is one undivided corridor — so at a T the stem is the
 * LONGEST corridor at the node and "the longest street has priority" hands the
 * right of way to the side road. Two arms on an axis is what "runs through"
 * means.
 *
 * Length only breaks a tie: at a four-arm node where both axes run through, the
 * one with more street on it holds priority, which is how a road crossing a
 * driveway comes out right.
 *
 * A tie is `undefined` and nobody gives way. Two equal streets crossing at an
 * unsignalled junction is a place the rule cannot resolve, and stopping both is
 * a deadlock — this is a priority rule, deliberately, not an all-way stop.
 */
export function priorityAxis(node, corridors) {
  if (!node || node.kind !== "junction") return undefined;
  const arms = { ns: 0, ew: 0 };
  const total = { ns: 0, ew: 0 };
  for (const id of node.corridors) {
    const corridor = corridors[id];
    if (!corridor) continue;
    const axis = axisOfArm(node, corridor);
    arms[axis] += 1;
    total[axis] += corridor.length;
  }
  if (arms.ns >= 2 && arms.ew < 2) return "ns";
  if (arms.ew >= 2 && arms.ns < 2) return "ew";
  if (arms.ns < 2 && arms.ew < 2) return undefined;
  if (total.ns > total.ew * 1.2) return "ns";
  if (total.ew > total.ns * 1.2) return "ew";
  return undefined;
}

/** Does a corridor arriving at this node have to give way? */
export function givesWayAt(node, corridor, corridors) {
  const priority = priorityAxis(node, corridors);
  if (!priority || !corridor) return false;
  return axisOfArm(node, corridor) !== priority;
}

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

/** How many doors that draw people an arm needs before its crossing is painted. */
const DOOR_PEOPLE = 1;


/** The shortest distance from a point to a polyline, in metres. */
function toLine(points, x, z) {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
  }
  return best;
}

/**
 * How many doors that DRAW people open onto each corridor (S3): a standing
 * shop's and a civic building's, each on the corridor its door is nearest. A
 * house's door is not counted — people leave a house for somewhere, and the
 * somewhere is where they cross. Derived once per model.
 *
 * Not `occupancy`: the engine fills it with RESIDENTS, so every shop in a played
 * city has none. The first cut counted `occupancy × perOccupant`, passed its
 * test on a shop the test gave 40 occupants, and painted no crossing at a shop
 * in any real game — found when S3b's shot tool could not find a single one.
 */
const demandByModel = new WeakMap();
export function doorDemand(model, cfg = getConfig()) {
  let found = demandByModel.get(model);
  if (found) return found;
  found = new Map();
  for (const lot of model.lots) {
    const b = lot.building;
    if (!b || !(b.zone === 2 || (b.zone === 0 && b.def))) continue;
    // A building the fire has taken is not somewhere anyone crosses to.
    if ((b.flags & FLAG_RUINED) !== 0) continue;
    const people = 1;
    const door = doorPoint(frontEdgeOf(lot), OUTWARD[lot.frontage]);
    let near;
    let dist = Infinity;
    for (const corridor of model.corridors) {
      const d = toLine(corridor.points, door.x, door.z);
      if (d < dist) { dist = d; near = corridor.id; }
    }
    if (near !== undefined) found.set(near, (found.get(near) ?? 0) + people);
  }
  demandByModel.set(model, found);
  return found;
}

/**
 * Is a crossing painted here? (S3, the review after S5.) At a signalled
 * junction, or where the doors on one of its arms draw people. T1 kept bars at
 * EVERY junction (A51), and from the air a dense grid was white bars: a zebra
 * is where people cross, and on a street of houses at a give-way corner there
 * is nobody to cross to.
 */
export function crossingWanted(model, node, cfg = getConfig()) {
  if (!node || node.kind !== "junction") return false;
  if (isSignalled(node, model.corridors, cfg)) return true;
  const demand = doorDemand(model, cfg);
  return node.corridors.some((id) => (demand.get(id) ?? 0) >= DOOR_PEOPLE);
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
  // Where a signal or a door demand is (S3): T1 kept the bars at every
  // junction, and the review after S5 saw a grid of white bars from the air.
  if (!crossingWanted(model, node, cfg)) return [];
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

/**
 * The stop line and a lane arrow on each approach to a SIGNALLED junction (S3):
 * where the lights stop the traffic, painted. From the lane graph's own inbound
 * links, whose last point is where a car stops — a second copy of "where is the
 * stop line" is a line painted where no car stops. The line sits just behind
 * the zebra and the arrow a car's length behind that, both across and along
 * the one lane that arrives. Each mark is `{ kind, width, points }`, like a bar.
 */
export function stopMarks(model, node, cfg = getConfig()) {
  if (!node || !isSignalled(node, model.corridors, cfg)) return [];
  const laneHalf = cfg.road.width / 4;
  const behindZebra = BARS * BAR_W * 2.2 / 2 + BAR_W + 0.4;
  const out = [];
  for (const link of model.lanes?.links ?? []) {
    if (link.kind !== "block" || link.to !== node.id) continue;
    const n = link.pts.length / 3;
    if (n < 2) continue;
    const px = link.pts[(n - 1) * 3];
    const pz = link.pts[(n - 1) * 3 + 2];
    const qx = link.pts[(n - 2) * 3];
    const qz = link.pts[(n - 2) * 3 + 2];
    const len = Math.hypot(px - qx, pz - qz) || 1;
    const tx = (px - qx) / len;   // towards the junction
    const tz = (pz - qz) / len;
    const rx = -tz;
    const rz = tx;
    const back = (d) => ({ x: px - tx * d, z: pz - tz * d });
    const s = back(behindZebra);
    out.push({
      kind: "stop", width: 0.3,
      points: [{ x: s.x - rx * laneHalf, z: s.z - rz * laneHalf }, { x: s.x + rx * laneHalf, z: s.z + rz * laneHalf }],
    });
    const tip = back(behindZebra + 3);
    const tail = back(behindZebra + 7);
    out.push({ kind: "arrow", width: 0.18, points: [tail, tip] });
    for (const side of [-1, 1]) {
      const barb = back(behindZebra + 4.2);
      out.push({ kind: "arrow", width: 0.18, points: [{ x: barb.x + rx * side * 0.6, z: barb.z + rz * side * 0.6 }, tip] });
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

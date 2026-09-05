// Corridors: the road network as polylines with a width.
//
// The road layer is a bit per tile plus a four-bit connection mask the reducer
// maintains (ruling 030). A corridor is a maximal run of tiles with exactly two
// opposite connections, between two NODES — an end, a bend, a T or an X — with
// its centreline through the tile centres in metres. It is what the ground
// flattens under, what a lot fronts, what the lane graph is built on and what
// the walkthrough gate steers by (specs/engine/04-city-model.md §4.3). One
// definition, four consumers.

import { DIR4, tileAt } from "../../shared/grid.js";
import { NET_PRESENT } from "../constants-mirror.js";
import { getConfig } from "./config.js";

const OPPOSITE = [2, 3, 0, 1];
const STRAIGHT = [5, 10];

function degree(mask) {
  let bits = 0;
  for (let d = 0; d < 4; d += 1) if (mask & (1 << d)) bits += 1;
  return bits;
}

/** A tile with two opposite connections is interior; everything else is a node. */
export function nodeKind(mask) {
  const bits = degree(mask);
  if (bits === 0) return "isolated";
  if (bits === 1) return "end";
  if (bits === 2) return STRAIGHT.includes(mask) ? "" : "bend";
  return "junction";
}

function centreOf(width, index, tileM) {
  const x = index % width;
  const y = (index - x) / width;
  return { x: (x + 0.5) * tileM, z: (y + 0.5) * tileM };
}

/** A cubic bezier through a bend, sampled, so a road that turns a corner is a
 * curve on the ground and in the lane graph rather than two ribbons meeting
 * at a point. */
function bendCurve(a, node, b, samples = 8) {
  const pts = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const u = 1 - t;
    pts.push({
      x: u * u * a.x + 2 * u * t * node.x + t * t * b.x,
      z: u * u * a.z + 2 * u * t * node.z + t * t * b.z,
    });
  }
  return pts;
}

function polyLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  return total;
}

/** Closest point on a polyline. No allocation in the loop; called per query. */
export function closestOnPolyline(points, x, z) {
  let best = Infinity;
  let bs = 0;
  let bx = 0;
  let bz = 0;
  let run = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 1e-9 ? ((x - a.x) * dx + (z - a.z) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < best) {
      best = d; bx = px; bz = pz; bs = run + Math.sqrt(len2) * t;
    }
    run += Math.sqrt(len2);
  }
  return { dist: Math.sqrt(best), x: bx, z: bz, s: bs };
}

export function deriveCorridors(state, kindOfTile = "road") {
  const cfg = getConfig();
  const tileM = cfg.tileM;
  const half = cfg.road.width / 2;
  const frontage = half + cfg.road.sidewalk;
  const { width, height } = state;
  const layer = state.tiles[kindOfTile];
  const present = (i) => (layer[i] & NET_PRESENT) !== 0;
  const maskOf = (i) => layer[i] & 15;

  const nodes = [];
  const nodeAt = new Map();
  for (let i = 0; i < layer.length; i += 1) {
    if (!present(i)) continue;
    const kind = nodeKind(maskOf(i));
    if (!kind) continue;
    const node = { id: nodes.length, tile: i, ...centreOf(width, i, tileM), mask: maskOf(i), degree: degree(maskOf(i)), kind, corridors: [] };
    nodes.push(node);
    nodeAt.set(i, node);
  }

  const corridors = [];
  const taken = new Set();   // "tile:dir" already walked from
  const walk = (start, dir) => {
    const points = [{ x: start.x, z: start.z }];
    const tiles = [start.tile];
    let x = start.tile % width;
    let y = (start.tile - x) / width;
    let d = dir;
    for (;;) {
      x += DIR4[d].dx;
      y += DIR4[d].dy;
      const i = tileAt(width, x, y);
      const c = centreOf(width, i, tileM);
      points.push(c);
      tiles.push(i);
      const end = nodeAt.get(i);
      if (end) {
        taken.add(`${i}:${OPPOSITE[d]}`);
        return { points, tiles, end };
      }
      // interior: leave by the connection that is not the one we came in on
      const mask = maskOf(i);
      d = (mask & ~(1 << OPPOSITE[d])) === (1 << 0) ? 0
        : (mask & ~(1 << OPPOSITE[d])) === (1 << 1) ? 1
          : (mask & ~(1 << OPPOSITE[d])) === (1 << 2) ? 2 : 3;
      if (tiles.length > width * height) return { points, tiles, end: start };   // a loop
    }
  };
  for (const node of nodes) {
    for (let d = 0; d < 4; d += 1) {
      if (!(node.mask & (1 << d))) continue;
      if (taken.has(`${node.tile}:${d}`)) continue;
      taken.add(`${node.tile}:${d}`);
      const { points, tiles, end } = walk(node, d);
      const corridor = {
        id: corridors.length, kind: kindOfTile, points, tiles,
        half, frontage, length: polyLength(points), from: node.id, to: end.id,
      };
      corridors.push(corridor);
      node.corridors.push(corridor.id);
      if (end !== node) end.corridors.push(corridor.id);
    }
  }

  // A ring of road with no node on it: pick one tile as a synthetic node so
  // the loop still becomes a corridor rather than vanishing.
  const covered = new Set();
  for (const c of corridors) for (const t of c.tiles) covered.add(t);
  for (let i = 0; i < layer.length; i += 1) {
    if (!present(i) || covered.has(i) || nodeAt.has(i)) continue;
    const mask = maskOf(i);
    const node = { id: nodes.length, tile: i, ...centreOf(width, i, tileM), mask, degree: 2, kind: "loop", corridors: [] };
    nodes.push(node);
    nodeAt.set(i, node);
    const d = (mask & 1) ? 0 : 1;
    taken.add(`${i}:${d}`);
    const { points, tiles } = walk(node, d);
    const corridor = { id: corridors.length, kind: kindOfTile, points, tiles, half, frontage, length: polyLength(points), from: node.id, to: node.id };
    corridors.push(corridor);
    node.corridors.push(corridor.id);
    for (const t of tiles) covered.add(t);
  }

  // Bends: a curve joining the two corridors that meet there.
  const connectors = [];
  for (const node of nodes) {
    if (node.kind !== "bend" || node.corridors.length !== 2) continue;
    const [ca, cb] = node.corridors.map((id) => corridors[id]);
    const towards = (c) => (c.from === node.id ? c.points[1] : c.points[c.points.length - 2]);
    const a = towards(ca);
    const b = towards(cb);
    const mid = (p) => ({ x: (p.x + node.x) / 2, z: (p.z + node.z) / 2 });
    connectors.push({ node: node.id, a: ca.id, b: cb.id, points: bendCurve(mid(a), node, mid(b)) });
  }

  for (const c of corridors) {
    let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
    for (const p of c.points) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
    }
    const pad = frontage + cfg.road.blend + 1;
    c.box = { x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad };
  }

  /** Nearest corridor or node to a point: `{ corridor, node, dist, s, x, z }`
   * or undefined when nothing is within `max` metres. */
  function nearest(x, z, max = frontage + cfg.road.blend) {
    let best;
    // The box is padded by the default reach; a wider search widens the test.
    const slack = Number.isFinite(max) ? Math.max(0, max - (frontage + cfg.road.blend)) : Infinity;
    for (const c of corridors) {
      const b = c.box;
      if (x < b.x0 - slack || x > b.x1 + slack || z < b.z0 - slack || z > b.z1 + slack) continue;
      const hit = closestOnPolyline(c.points, x, z);
      if (hit.dist <= max && (!best || hit.dist < best.dist)) best = { corridor: c, dist: hit.dist, s: hit.s, x: hit.x, z: hit.z };
    }
    for (const n of nodes) {
      if (n.corridors.length > 0 && n.kind !== "isolated") continue;
      const d = Math.max(Math.abs(x - n.x), Math.abs(z - n.z));
      if (d <= max && (!best || d < best.dist)) best = { node: n, dist: d, s: 0, x: n.x, z: n.z };
    }
    return best;
  }

  return { corridors, nodes, connectors, nearest, half, frontage };
}

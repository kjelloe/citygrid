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
import { NET_PRESENT, NET_AVENUE } from "../constants-mirror.js";
import { getConfig } from "./config.js";

const OPPOSITE = [2, 3, 0, 1];
const EMPTY = [];
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

/** The cross-section of a corridor of this kind: half a carriageway, how far
 * the frontage line stands from the centre, how many lanes each way and how
 * wide the median between them (T1). One place, because the ribbon, the lane
 * offsets, the junction box and the ground's flatten all have to agree about
 * where the kerb is. One per corridor, never per tile — ruling 043. */
function sectionOf(cfg, avenue, layer) {
  // A railway is its own cross-section and has no pavement: `frontage` is the
  // ballast's own edge, so a lot fronts a street and never a line (T3).
  if (layer === "rail") {
    const half = cfg.rail.width / 2;
    return { avenue: false, half, frontage: half, lanes: 1, median: 0 };
  }
  const spec = avenue ? cfg.road.avenue : cfg.road;
  const half = spec.width / 2;
  return {
    avenue,
    half,
    frontage: half + cfg.road.sidewalk,
    lanes: spec.lanes,
    median: avenue ? spec.median : 0,
  };
}

/** How wide one lane of a corridor is: the carriageway on one side of the
 * median, split between that side's lanes. */
export function laneWidth(corridor) {
  return (corridor.half - corridor.median / 2) / corridor.lanes;
}

/** How far the centre of lane `index` sits from the centre line, counted from
 * the middle of the road OUTWARD — lane 0 is against the median and lane
 * `lanes - 1` is at the kerb.
 *
 * Here rather than in each of its three readers (T1b): the lane graph offsets
 * a polyline by it, the L3 baker lays a wear band down it and paints the line
 * between two of them, and the stop mark is drawn across one. A number written
 * down three times is a defect waiting for the next edit.
 */
export function laneOffset(corridor, index) {
  return corridor.median / 2 + laneWidth(corridor) * (index + 0.5);
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

/**
 * A derived thing's identity (W6a).
 *
 * Every id in this directory is an array index assigned at derivation, so one
 * new junction renumbers every corridor, lane and nav edge after it — which is
 * why a build action throws away every car, person, train and boat in the city.
 * A key is built from what the ENGINE owns (tile indices) and from geometry, so
 * the same street is the same street across a rebuild.
 *
 * A node is at one tile, so its tile IS its key. A corridor is its two end
 * tiles and its length in tiles: the ends alone are not enough (a ring of road
 * leaves and returns to the same node, and two corridors can join the same pair
 * of junctions), and the whole tile list would make a key that changes when a
 * neighbour is paved — which it should not, because the corridor itself has not
 * moved.
 *
 * The ends are written low-first so that the key does not depend on which end
 * the walk started from.
 */
function keyOfNode(tile) {
  return `n${tile}`;
}

function keyOfCorridor(kindOfTile, fromTile, toTile, tiles) {
  const low = Math.min(fromTile, toTile);
  const high = Math.max(fromTile, toTile);
  return `${kindOfTile}:${low}-${high}x${tiles.length}`;
}

export function deriveCorridors(state, kindOfTile = "road") {
  const cfg = getConfig();
  const tileM = cfg.tileM;
  const street = sectionOf(cfg, false, kindOfTile);
  const avenueSection = sectionOf(cfg, true, kindOfTile);
  const { half, frontage } = street;
  const { width, height } = state;
  const layer = state.tiles[kindOfTile];
  const present = (i) => (layer[i] & NET_PRESENT) !== 0;
  const maskOf = (i) => layer[i] & 15;
  // Only the road layer has a kind (T1); rail and the rest are one width.
  const avenueAt = kindOfTile === "road" ? (i) => (layer[i] & NET_AVENUE) !== 0 : () => false;

  const nodes = [];
  const nodeAt = new Map();
  for (let i = 0; i < layer.length; i += 1) {
    if (!present(i)) continue;
    const kind = nodeKind(maskOf(i));
    if (!kind) continue;
    const node = { id: nodes.length, key: keyOfNode(i), tile: i, ...centreOf(width, i, tileM), mask: maskOf(i), degree: degree(maskOf(i)), kind, corridors: [] };
    nodes.push(node);
    nodeAt.set(i, node);
  }

  // A SEAM: where a run changes kind mid-street. A corridor has one width from
  // end to end — it is what the ribbon is built at, what a lot fronts and what
  // the lane offsets are measured from — so an avenue that starts halfway along
  // a street has to end one corridor and begin another. The node is the first
  // AVENUE tile, so the wider half owns the transition, and the lane graph
  // tapers across it rather than stepping sideways (ruling 043).
  for (let i = 0; i < layer.length; i += 1) {
    if (!present(i) || nodeAt.has(i) || !avenueAt(i)) continue;
    const mask = maskOf(i);
    const x = i % width;
    const y = (i - x) / width;
    let seam = false;
    for (let d = 0; d < 4; d += 1) {
      if (!(mask & (1 << d))) continue;
      const j = tileAt(width, x + DIR4[d].dx, y + DIR4[d].dy);
      if (!avenueAt(j)) seam = true;
    }
    if (!seam) continue;
    const node = { id: nodes.length, key: keyOfNode(i), tile: i, ...centreOf(width, i, tileM), mask, degree: degree(mask), kind: "seam", corridors: [] };
    nodes.push(node);
    nodeAt.set(i, node);
  }

  /** A run's kind, from the tiles that are only its own: the tiles at either
   * end are shared with the nodes there, and at a seam one of them is of the
   * other kind by construction. */
  const sectionFor = (tiles) => {
    const inner = tiles.length > 2 ? tiles.slice(1, -1) : tiles;
    let avenues = 0;
    for (const t of inner) if (avenueAt(t)) avenues += 1;
    return avenues * 2 > inner.length ? avenueSection : street;
  };

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
        id: corridors.length, key: keyOfCorridor(kindOfTile, node.tile, end.tile, tiles),
        kind: kindOfTile, points, tiles,
        ...sectionFor(tiles), length: polyLength(points), from: node.id, to: end.id,
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
    const node = { id: nodes.length, key: keyOfNode(i), tile: i, ...centreOf(width, i, tileM), mask, degree: 2, kind: "loop", corridors: [] };
    nodes.push(node);
    nodeAt.set(i, node);
    const d = (mask & 1) ? 0 : 1;
    taken.add(`${i}:${d}`);
    const { points, tiles } = walk(node, d);
    const corridor = {
      id: corridors.length, key: keyOfCorridor(kindOfTile, node.tile, node.tile, tiles),
      kind: kindOfTile, points, tiles, ...sectionFor(tiles), length: polyLength(points),
      from: node.id, to: node.id,
    };
    corridors.push(corridor);
    node.corridors.push(corridor.id);
    for (const t of tiles) covered.add(t);
  }

  // A node is as wide as the widest street at it: the junction box, the signal
  // heads and the ground's flatten all step out from the middle of it, and at a
  // corner where an avenue meets a street the box has to cover the avenue.
  for (const node of nodes) {
    let widest = street;
    for (const id of node.corridors) if (corridors[id].half > widest.half) widest = corridors[id];
    node.half = widest.half;
    node.frontage = widest.frontage;
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
    const pad = c.frontage + cfg.road.blend + 1;
    c.box = { x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad };
  }

  // A uniform grid over the corridor boxes, one cell per tile.
  //
  // `heightAt` and `nearest` both used to walk every corridor and box-test it.
  // That is nothing for an occasional query and quadratic for the lane graph,
  // which asks forty thousand times: 97 ms of a 123 ms model rebuild on a
  // saturated 96×96, on every build action (slice E1). The walkthrough gate
  // (E4) will ask far more often than that.
  const CELL = tileM;
  const index = new Map();
  const key = (cx, cz) => cx * 100003 + cz;
  for (const c of corridors) {
    const b = c.box;
    for (let cz = Math.floor(b.z0 / CELL); cz <= Math.floor(b.z1 / CELL); cz += 1) {
      for (let cx = Math.floor(b.x0 / CELL); cx <= Math.floor(b.x1 / CELL); cx += 1) {
        const k = key(cx, cz);
        const bucket = index.get(k);
        if (bucket) bucket.push(c);
        else index.set(k, [c]);
      }
    }
  }

  /** The corridors whose padded box could reach `(x, z)`, widened by `slack`.
   * A superset, cheap to compute; callers still test the box and the distance. */
  function near(x, z, slack = 0) {
    if (!Number.isFinite(slack)) return corridors;
    const x0 = Math.floor((x - slack) / CELL);
    const x1 = Math.floor((x + slack) / CELL);
    const z0 = Math.floor((z - slack) / CELL);
    const z1 = Math.floor((z + slack) / CELL);
    if (x0 === x1 && z0 === z1) return index.get(key(x0, z0)) ?? EMPTY;
    const out = [];
    for (let cz = z0; cz <= z1; cz += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
        const bucket = index.get(key(cx, cz));
        if (!bucket) continue;
        for (const c of bucket) if (!out.includes(c)) out.push(c);
      }
    }
    return out;
  }

  /** Nearest corridor or node to a point: `{ corridor, node, dist, s, x, z }`
   * or undefined when nothing is within `max` metres. */
  function nearest(x, z, max = frontage + cfg.road.blend) {
    let best;
    // The box is padded by the default reach; a wider search widens the test.
    const slack = Number.isFinite(max) ? Math.max(0, max - (frontage + cfg.road.blend)) : Infinity;
    for (const c of near(x, z, slack)) {
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

  return { corridors, nodes, connectors, nearest, near, half, frontage };
}

// The nav graph: where a person can walk (slice E7; spec §9.3).
//
// The pedestrian counterpart of `lanes.js`. A corridor is a polyline with a
// width; a PAVEMENT is one side of it, offset half a carriageway plus half a
// footway, stopping a junction box short at each end — the same trim the kerb
// already uses (E3), from the same `polyline.js` the lane graph uses, because
// a lane that stops short of a junction and a pavement that does not is a
// pedestrian standing in the traffic.
//
// Four kinds of edge, and that is the whole graph:
//
//   walk    one side of one corridor, between its two end corners
//   cross   over a carriageway at a node, carrying that node's signal axis so
//           somebody can wait at a red light
//   corner  round a junction between two corridors' pavements, never signalled
//   (doors are not edges) a lot's door is a POINT on a walk edge, which is
//           where a person appears from and disappears into
//
// **There is no route planner, deliberately.** Spec §9.3's useful subset is
// "commuters between a door and the map edge, shoppers between commercial
// doors, waiting at a signal" and none of that needs one: a person picks a
// successor edge at each junction by a hash of their own id, exactly as a car
// picks its turn (`traffic.js`), and the doors decide where people ENTER the
// graph and how many. That gives crowds outside busy buildings, people waiting
// at red, and nobody walking through a wall, for the cost of a hash. Roles and
// real door-to-door journeys are the next step and are **Q62**.
//
// Pure and derived (ruling 032): a discarded nav graph and a rebuilt one are
// the same graph.

import { DIR4 } from "../../shared/grid.js";
import { getConfig } from "./config.js";
import { offsetPolyline, trim, packWithHeight, sampleAlong, closestAlong } from "./polyline.js";
import { frontEdgeOf, OUTWARD } from "./lots.js";
import { doorPoint } from "./street-furniture.js";
import { CIVIC_SHAPES } from "./civic-spec.js";
import { ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL, FLAG_RUINED } from "../constants-mirror.js";

/**
 * What a building asks for on the pavement outside it (B10, Q146).
 *
 * **Not `occupancy`.** The engine fills that with RESIDENTS: on the film's own
 * played 96 the 22 shops, 50 works and 81 civic buildings have none between
 * them, so their pavements asked for nobody — and `walks` keeps only edges with
 * demand, so neither crowd could put a person on a high street at all. The
 * storyboard walked one and the nearest posed person was 137 m away.
 * `signals.js` learned the same thing for crossings at S3b and says so in its
 * own comment; this is the other reader.
 *
 * A home pulls by who lives in it. Everything else pulls by what it is: a shop
 * and a works by their LEVEL — a level-3 parade is busier than a corner shop —
 * and a civic building by its own `pull` in `civic-spec.js`, which is 0 for a
 * pump and eight for a station, because nobody strolls past a reservoir.
 */
function doorPull(building, cfg = getConfig()) {
  if (!building) return 0;
  // A ruin draws nobody (the same exclusion `signals.js` makes for crossings).
  if ((building.flags & FLAG_RUINED) !== 0) return 0;
  const level = Math.max(1, building.level ?? 1);
  if (building.zone === ZONE_RESIDENTIAL) return (building.occupancy ?? 0) * cfg.ped.perOccupant;
  if (building.zone === ZONE_COMMERCIAL) return level * cfg.ped.perShop;
  if (building.zone === ZONE_INDUSTRIAL) return level * cfg.ped.perWorks;
  return CIVIC_SHAPES[building.def]?.pull ?? 0;
}

const AXIS = ["ns", "ew", "ns", "ew"];   // DIR4 order: N, E, S, W

/** How far from the centre line a pavement runs: the middle of the footway. */
export function WALK_OFFSET(cfg = getConfig(), half = cfg.road.width / 2) {
  return half + cfg.road.sidewalk / 2;
}

/** Which arm of a node a point lies on, in DIR4 order. */
function armOf(node, x, z) {
  let best = 0;
  let bestDot = -Infinity;
  const len = Math.hypot(x - node.x, z - node.z) || 1;
  const fx = (x - node.x) / len;
  const fz = (z - node.z) / len;
  for (let d = 0; d < 4; d += 1) {
    const dot = DIR4[d].dx * fx + DIR4[d].dy * fz;
    if (dot > bestDot) { bestDot = dot; best = d; }
  }
  return best;
}

export function deriveNav(state, model) {
  const cfg = getConfig();

  // The pavement's surface, not the ground: E3 lays the carriageway a `lift`
  // above the height field and the footway a kerb above that, so a person
  // reading `heightAt` would walk with their ankles in the pavement.
  const surface = (x, z) => model.heightAt(x, z) + cfg.road.lift + cfg.road.kerb;
  const clearAt = (corridor) => corridor.half + cfg.road.sidewalk;

  const nodes = [];
  const edges = [];
  /** node key → nav node id. A corner belongs to one network node, one
   * corridor and one side, which is exactly what a pavement end is. */
  const corners = new Map();

  function navNode(x, z, at, key) {
    const id = nodes.length;
    nodes.push({ id, key, x, z, at, edges: [] });
    return id;
  }

  /** The key of a network thing, for building nav keys out of (W6a). A nav
   * graph derived from corridors inherits their identity: both of these are
   * geometry, so a build elsewhere leaves them alone. */
  const corridorKeyOf = (id) => model.corridors[id]?.key ?? `c${id}`;
  const nodeKeyOf = (id) => model.nodes[id]?.key ?? `n${id}`;

  function cornerAt(networkNode, corridorId, side, x, z) {
    const key = `${networkNode}:${corridorId}:${side}`;
    let id = corners.get(key);
    if (id === undefined) {
      id = navNode(x, z, networkNode, `c|${nodeKeyOf(networkNode)}|${corridorKeyOf(corridorId)}|${side}`);
      corners.set(key, id);
    }
    return id;
  }

  function addEdge(edge) {
    edge.id = edges.length;
    edges.push(edge);
    nodes[edge.from].edges.push(edge.id);
    nodes[edge.to].edges.push(edge.id);
    return edge;
  }

  // --- the pavements ----------------------------------------------------------
  for (const corridor of model.corridors) {
    for (const side of [-1, 1]) {
      // The pavement of THIS street: an avenue's is three metres further out
      // than a street's, and a nav graph that does not know it walks people up
      // the outside lane (T1b).
      const line = offsetPolyline(corridor.points, WALK_OFFSET(cfg, corridor.half) * side);
      const cut = trim(line, clearAt(corridor), clearAt(corridor));
      if (cut.length < 2) continue;
      const packed = packWithHeight(cut, surface);
      if (packed.len < 1e-6) continue;
      const from = cornerAt(corridor.from, corridor.id, side, cut[0].x, cut[0].z);
      const to = cornerAt(corridor.to, corridor.id, side, cut[cut.length - 1].x, cut[cut.length - 1].z);
      addEdge({
        key: `w|${corridor.key}|${side}`,
        kind: "walk", corridor: corridor.id, side, from, to, doors: [], demand: 0, ...packed,
      });
    }
  }

  // --- the crossings ----------------------------------------------------------
  //
  // One per (node, corridor): over the carriageway between the two pavements of
  // the same street. `axis` is the axis of the arm the crossing sits on, which
  // is the axis whose GREEN sends the cars across it — so a person crosses when
  // the light is against that axis, the same rule from the other side.
  for (const node of model.nodes) {
    for (const corridorId of node.corridors) {
      const a = corners.get(`${node.id}:${corridorId}:-1`);
      const b = corners.get(`${node.id}:${corridorId}:1`);
      if (a === undefined || b === undefined) continue;
      const packed = packWithHeight([nodes[a], nodes[b]], surface);
      if (packed.len < 1e-6) continue;
      // An axis only where there IS a signal (T1, A51): since only a crossing
      // of two real streets is signalled, most nodes are give-way, and a
      // pedestrian holding for a phase that never changes waits for ever.
      const signalled = model.lanes.signals.has(node.id);
      addEdge({
        key: `x|${node.key}|${corridorKeyOf(corridorId)}`,
        kind: "cross", corridor: corridorId, node: node.id,
        axis: signalled
          ? AXIS[armOf(node, (nodes[a].x + nodes[b].x) / 2, (nodes[a].z + nodes[b].z) / 2)]
          : undefined,
        from: a, to: b, doors: [], demand: 0, ...packed,
      });
    }
  }

  // --- round the corners -------------------------------------------------------
  //
  // Between every pair of corners at a node that are NOT on the same corridor
  // and are near enough to be the same pavement bending round: a person walking
  // north up one street and turning east walks over the corner, not across two
  // roads. The distance test is what keeps it from joining opposite corners of
  // a crossroads, which would be a diagonal through the traffic.
  // PER NODE since T1: a fixed reach taken from the avenue's width joins the
  // opposite corners of an eight-metre crossroads, which is a pavement edge
  // diagonally through the traffic.
  const reachAt = (id) => ((model.nodes[id]?.half ?? cfg.road.width / 2) + cfg.road.sidewalk) * 1.6;
  const byNode = new Map();
  for (const [key, id] of corners) {
    const at = Number(key.split(":")[0]);
    const list = byNode.get(at);
    if (list) list.push({ key, id }); else byNode.set(at, [{ key, id }]);
  }
  for (const [at, list] of byNode) {
    const cornerReach = reachAt(at);
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const [, ci] = list[i].key.split(":");
        const [, cj] = list[j].key.split(":");
        if (ci === cj) continue;
        const a = nodes[list[i].id];
        const b = nodes[list[j].id];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d > cornerReach || d < 1e-6) continue;
        const packed = packWithHeight([a, b], surface);
        addEdge({
          key: `k|${nodes[list[i].id].key}>${nodes[list[j].id].key}`,
          kind: "corner", from: list[i].id, to: list[j].id, doors: [], demand: 0, ...packed,
        });
      }
    }
  }

  // --- the doors ----------------------------------------------------------------
  //
  // A lot's door is the outer end of E5's path, projected onto the nearest
  // pavement. A POINT on an edge rather than a node of its own: a door node
  // would split every pavement it sat on, and what a pedestrian needs is where
  // to appear, not a junction.
  const walks = edges.filter((e) => e.kind === "walk");

  /**
   * **The nearest pavement to a door, found by RINGS** (W6b).
   *
   * This loop was every lot against every pavement: 284 lots × 2,800 walk edges
   * on a played 96, each one a projection onto every segment, and it was most of
   * why `deriveNav` cost **65 ms** — two thirds of the 98 ms a build action
   * spends on derivation, and more than the whole city model beside it.
   *
   * The answer is the same one, not a near one: rings are searched outward from
   * the door's own tile and the search stops only when the next ring cannot hold
   * anything closer than the best found so far. A door with no pavement within
   * the cap falls back to the full scan, so the one case this cannot index is
   * still correct rather than missing.
   */
  const walkIndex = new Map();
  for (const edge of walks) {
    const n = edge.pts.length / 3;
    for (let i = 0; i < n; i += 1) {
      const tile = Math.floor(edge.pts[i * 3 + 2] / cfg.tileM) * state.width
        + Math.floor(edge.pts[i * 3] / cfg.tileM);
      const list = walkIndex.get(tile);
      if (list) { if (list[list.length - 1] !== edge) list.push(edge); } else walkIndex.set(tile, [edge]);
    }
  }
  const RINGS = 12;
  function nearestWalk(x, z) {
    const cx = Math.floor(x / cfg.tileM);
    const cz = Math.floor(z / cfg.tileM);
    let best;
    const seen = new Set();
    for (let r = 0; r <= RINGS; r += 1) {
      // Everything in ring `r` is at least `(r - 1) * tileM` away, so once the
      // best is nearer than that, no further ring can beat it.
      if (best && (r - 1) * cfg.tileM > best.dist) return best;
      for (let dz = -r; dz <= r; dz += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (r > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          for (const edge of walkIndex.get((cz + dz) * state.width + (cx + dx)) ?? []) {
            if (seen.has(edge.id)) continue;
            seen.add(edge.id);
            const hit = closestAlong(edge, x, z);
            if (!best || hit.dist < best.dist) best = { edge: edge.id, s: hit.s, dist: hit.dist };
          }
        }
      }
    }
    if (best) return best;
    for (const edge of walks) {
      const hit = closestAlong(edge, x, z);
      if (!best || hit.dist < best.dist) best = { edge: edge.id, s: hit.s, dist: hit.dist };
    }
    return best;
  }

  const doors = [];
  for (const lot of model.lots) {
    const front = frontEdgeOf(lot);
    const point = doorPoint(front, OUTWARD[lot.frontage]);
    const best = nearestWalk(point.x, point.z);
    if (!best) continue;
    const door = {
      key: `d|${lot.id}`,
      lot: lot.id, x: point.x, z: point.z, edge: best.edge, s: best.s, dist: best.dist,
      people: doorPull(lot.building, cfg),
    };
    doors.push(door);
    edges[best.edge].doors.push(doors.length - 1);
    edges[best.edge].demand += door.people;
  }

  // --- the parks (S5) ----------------------------------------------------------
  //
  // A park's path joins the pavement at its gate, so people go in. Two edges
  // from the nearer end of the pavement to the park's middle — along the
  // pavement to the gate, then in — a little apart: a person who walks in on
  // one arrives at a node with only the other left, and walks out on it.
  for (const door of doors) {
    const lot = model.lotOf(door.lot);
    if (!lot || (lot.building?.def ?? "") !== "park") continue;
    const edge = edges[door.edge];
    const fromStart = door.s < edge.len / 2;
    const end = fromStart ? edge.from : edge.to;
    const s0 = fromStart ? 0 : edge.len;
    const steps = Math.max(1, Math.ceil(Math.abs(door.s - s0) / 2));
    const along = [];
    const at = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
    for (let i = 0; i <= steps; i += 1) {
      sampleAlong(edge, s0 + ((door.s - s0) * i) / steps, at);
      along.push({ x: at.x, z: at.z });
    }
    // A lot's id is the engine's building id, which is already stable.
    const middle = navNode(lot.cx, lot.cz, -1, `p|${lot.id}`);
    const dx = lot.cx - door.x;
    const dz = lot.cz - door.z;
    const run = Math.hypot(dx, dz) || 1;
    for (const lean of [-0.6, 0.6]) {
      const px = (-dz / run) * lean;
      const pz = (dx / run) * lean;
      const packed = packWithHeight([...along, { x: door.x + px, z: door.z + pz },
        { x: lot.cx + px, z: lot.cz + pz }], surface);
      if (packed.len < 1e-6) continue;
      addEdge({
        key: `g|${lot.id}|${edge.key}|${lean}`,
        kind: "park", lot: lot.id, from: end, to: middle, doors: [], demand: 0, ...packed,
      });
    }
  }

  /** Which edges can be walked onto from the end of `edge` reached travelling
   * in `dir` (+1 towards `to`, −1 towards `from`). Includes neither `edge`
   * itself nor a way back the way you came. */
  function next(edge, dir) {
    const at = dir > 0 ? edge.to : edge.from;
    return nodes[at].edges.filter((id) => id !== edge.id);
  }

  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };

  /**
   * The walkable edge nearest a point (B11's second half).
   *
   * Same reason the lane graph has one: a key cannot survive a street being
   * split, and somebody standing on that pavement has not moved. Indexed by
   * tile for the same reason — a played city has thousands of edges and
   * hundreds of people.
   */
  let edgeIndex;
  function indexOfEdges() {
    if (edgeIndex) return edgeIndex;
    edgeIndex = new Map();
    const tileM = cfg.tileM;
    for (const edge of edges) {
      const n = edge.pts.length / 3;
      for (let i = 0; i < n; i += 1) {
        const tile = Math.floor(edge.pts[i * 3 + 2] / tileM) * state.width
          + Math.floor(edge.pts[i * 3] / tileM);
        const list = edgeIndex.get(tile);
        if (list) { if (list[list.length - 1] !== edge) list.push(edge); } else edgeIndex.set(tile, [edge]);
      }
    }
    return edgeIndex;
  }

  function nearestEdge(x, z) {
    const index = indexOfEdges();
    const tileM = cfg.tileM;
    const cx = Math.floor(x / tileM);
    const cz = Math.floor(z / tileM);
    let best;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        for (const edge of index.get((cz + dz) * state.width + (cx + dx)) ?? []) {
          const n = edge.pts.length / 3;
          // Along the segments rather than to the nearest packed point, for the
          // reason the lane graph's version says: snapping to a point is a jump
          // of half the point spacing, and somebody re-seated three metres up
          // the pavement is somebody a player saw teleport.
          for (let i = 1; i < n; i += 1) {
            const ax = edge.pts[(i - 1) * 3];
            const az = edge.pts[(i - 1) * 3 + 2];
            const ex = edge.pts[i * 3] - ax;
            const ez = edge.pts[i * 3 + 2] - az;
            const span = ex * ex + ez * ez;
            const t = span > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / span)) : 0;
            const px = ax + ex * t;
            const pz = az + ez * t;
            const d = (px - x) * (px - x) + (pz - z) * (pz - z);
            if (best && d >= best.d) continue;
            best = { d, edge, s: ((i - 1 + t) / Math.max(1, n - 1)) * edge.len };
          }
        }
      }
    }
    return best;
  }

  const edgeKeys = new Map();
  for (const edge of edges) edgeKeys.set(edge.key, edge);
  const nodeKeys = new Map();
  for (const node of nodes) nodeKeys.set(node.key, node);

  return {
    nodes,
    edges,
    doors,
    /** By key, for a person who was walking somewhere before a build action
     * re-derived the graph under them (B11). */
    edgeByKey: (key) => edgeKeys.get(key),
    nearestEdge,
    navNodeByKey: (key) => nodeKeys.get(key),
    next,
    /** Position and unit tangent `s` metres along an edge. */
    sample(edge, s, into = out) { return sampleAlong(edge, s, into); },
    /** How many people this edge's buildings ask for. */
    demandOf(edge) { return edge.demand; },
    stats: {
      nodes: nodes.length,
      edges: edges.length,
      walks: walks.length,
      crossings: edges.filter((e) => e.kind === "cross").length,
      corners: edges.filter((e) => e.kind === "corner").length,
      doors: doors.length,
    },
  };
}

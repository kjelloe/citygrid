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

const AXIS = ["ns", "ew", "ns", "ew"];   // DIR4 order: N, E, S, W

/** How far from the centre line a pavement runs: the middle of the footway. */
export function WALK_OFFSET(cfg = getConfig()) {
  return cfg.road.width / 2 + cfg.road.sidewalk / 2;
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
  const offset = WALK_OFFSET(cfg);
  // The pavement's surface, not the ground: E3 lays the carriageway a `lift`
  // above the height field and the footway a kerb above that, so a person
  // reading `heightAt` would walk with their ankles in the pavement.
  const surface = (x, z) => model.heightAt(x, z) + cfg.road.lift + cfg.road.kerb;
  const clear = cfg.road.width / 2 + cfg.road.sidewalk;

  const nodes = [];
  const edges = [];
  /** node key → nav node id. A corner belongs to one network node, one
   * corridor and one side, which is exactly what a pavement end is. */
  const corners = new Map();

  function navNode(x, z, at) {
    const id = nodes.length;
    nodes.push({ id, x, z, at, edges: [] });
    return id;
  }

  function cornerAt(networkNode, corridorId, side, x, z) {
    const key = `${networkNode}:${corridorId}:${side}`;
    let id = corners.get(key);
    if (id === undefined) {
      id = navNode(x, z, networkNode);
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
      const line = offsetPolyline(corridor.points, offset * side);
      const cut = trim(line, clear, clear);
      if (cut.length < 2) continue;
      const packed = packWithHeight(cut, surface);
      if (packed.len < 1e-6) continue;
      const from = cornerAt(corridor.from, corridor.id, side, cut[0].x, cut[0].z);
      const to = cornerAt(corridor.to, corridor.id, side, cut[cut.length - 1].x, cut[cut.length - 1].z);
      addEdge({
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
  const cornerReach = (cfg.road.width / 2 + cfg.road.sidewalk) * 1.6;
  const byNode = new Map();
  for (const [key, id] of corners) {
    const at = Number(key.split(":")[0]);
    const list = byNode.get(at);
    if (list) list.push({ key, id }); else byNode.set(at, [{ key, id }]);
  }
  for (const list of byNode.values()) {
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
        addEdge({ kind: "corner", from: list[i].id, to: list[j].id, doors: [], demand: 0, ...packed });
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
  const doors = [];
  for (const lot of model.lots) {
    const front = frontEdgeOf(lot);
    const point = doorPoint(front, OUTWARD[lot.frontage]);
    let best;
    for (const edge of walks) {
      const hit = closestAlong(edge, point.x, point.z);
      if (!best || hit.dist < best.dist) best = { edge: edge.id, s: hit.s, dist: hit.dist };
    }
    if (!best) continue;
    const door = {
      lot: lot.id, x: point.x, z: point.z, edge: best.edge, s: best.s, dist: best.dist,
      // What the building asks for on the pavement outside it. Occupancy, so a
      // tower is busier than a bungalow (spec §9.3) — and level, because an
      // empty new-built block should not have a crowd outside it.
      people: (lot.building.occupancy ?? 0) * cfg.ped.perOccupant,
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
    const middle = navNode(lot.cx, lot.cz, -1);
    const dx = lot.cx - door.x;
    const dz = lot.cz - door.z;
    const run = Math.hypot(dx, dz) || 1;
    for (const lean of [-0.6, 0.6]) {
      const px = (-dz / run) * lean;
      const pz = (dx / run) * lean;
      const packed = packWithHeight([...along, { x: door.x + px, z: door.z + pz },
        { x: lot.cx + px, z: lot.cz + pz }], surface);
      if (packed.len < 1e-6) continue;
      addEdge({ kind: "park", lot: lot.id, from: end, to: middle, doors: [], demand: 0, ...packed });
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

  return {
    nodes,
    edges,
    doors,
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

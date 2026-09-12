// The lane graph: where a car is, as opposed to where the road is.
//
// A corridor (`corridors.js`) is a polyline through tile centres with a width.
// A lane is a *direction* on it, offset to the right of the centreline, ending
// a stop line short of the junction — and a set of curves through the junction
// joining it to the lanes that leave. That is the whole difference, and every
// part of it is arithmetic that looks fine in a screenshot when it is wrong:
// a lane on the wrong side gives left-hand traffic, a link longer than its
// corridor parks cars inside a junction, a connector whose ends do not meet
// teleports them.
//
// Pure and derived (ruling 032): nothing here is remembered, saved or agreed
// between clients. Ruling 037 — traffic is a local simulation, and this is the
// board it is played on.
//
// specs/engine/04-city-model.md §4.6.

import { DIR4 } from "../../shared/grid.js";
import { getConfig } from "./config.js";
import { jitter } from "./hash.js";
import { isSignalled, givesWayAt } from "./signals.js";
// Shared with the nav graph pedestrians walk on (E7): one copy of "offset a
// centre line" and "stop short of a junction", not two.
import { rightOf, offsetPolyline, trim, lengthOf } from "./polyline.js";

/** A quadratic through a junction: out of one lane's end, round the corner,
 * into the next lane's start. The control point is where the two LANE lines
 * meet (`cornerOf`) — not the node's centre, which pulled every curve toward
 * the middle of the box: two opposing straights came within 2.00 m of each
 * other there, with cars 2.2 m wide, so oncoming cars overlapped in every
 * junction in the city (B8). A right turn is still tighter than a left one,
 * because its two lane lines meet nearer the kerb. */
function turnCurve(a, node, b, samples = 6) {
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

/** Packs a polyline into the shape a car reads every frame: flat coordinates,
 * cumulative arc length, total length.
 *
 * `heightAt` may be replaced by a pair of end heights (`packBetween`): a
 * connector's two ends are the ends of the block links it joins, whose heights
 * are already known, and the ground inside a junction box is flattened by the
 * corridor blend anyway. That is worth doing because it is thirty thousand of
 * the thirty-seven thousand ground queries a saturated 96x96 makes while the
 * lane graph is derived, and a ground query is a microsecond. */
function pack(points, heightAt) {
  const pts = new Float32Array(points.length * 3);
  const cum = new Float32Array(points.length);
  let run = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    pts[i * 3] = p.x;
    pts[i * 3 + 1] = heightAt(p.x, p.z);
    pts[i * 3 + 2] = p.z;
    if (i > 0) run += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
    cum[i] = run;
  }
  return { pts, cum, len: run };
}

/**
 * A corridor's own centreline heights, once.
 *
 * A lane is a two-metre offset of the corridor and the ground inside a corridor
 * is flattened to its centreline (spec §5.1), so the height at a lane point IS
 * the corridor's height at the same fraction along it. Querying it per lane
 * point asked the ground 14,780 times while deriving the lane graph of a
 * 128×128 — 23 ms of the 52 that took (R2).
 */
function profileOf(corridor, ground) {
  // The GRADED profile itself when the ground has one (R3), rather than
  // `heightAt` re-sampled at the corridor's own twenty-metre points. R3 put
  // structure between those points — the junction box at each end is level for
  // `road.width / 2 + road.sidewalk`, capped at a sixth of the street — and
  // re-sampling at 20 m interpolates straight across it, which left a lane 0.7 m
  // off the ground near every junction after R4 fixed the mirror (R4).
  const graded = ground.profileOf?.(corridor.id);
  if (graded && graded.cum.length > 1) return { ys: graded.ys, cum: graded.cum, len: graded.len || 1 };
  const points = corridor.points;
  const ys = new Float64Array(points.length);
  const cum = new Float64Array(points.length);
  let run = 0;
  for (let i = 0; i < points.length; i += 1) {
    ys[i] = ground.heightAt(points[i].x, points[i].z);
    if (i > 0) run += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    cum[i] = run;
  }
  return { ys, cum, len: run || 1 };
}

/**
 * `pack`, reading the corridor's profile instead of asking the ground.
 *
 * By ARC LENGTH along the corridor, not by fraction of the lane's own length.
 * The fraction version had two errors, and R4 measured both on the saturated
 * 96×96 (era `ed96699`, buildings off, every packed point against `heightAt`
 * under it):
 *
 *   - a lane with `dir === 1` runs the corridor BACKWARDS, and its fraction was
 *     mapped onto a profile built in forward order — so the lane's start, at the
 *     corridor's far end, took the near end's height. **1.79 m mean error over
 *     3,742 points, 2,540 of them worse than half a metre, worst 12.44 m.** Half
 *     the traffic in the city was posed against the wrong end of its street: on
 *     a street that climbs twelve metres the cars going up it drove twelve
 *     metres underground, headlights and all.
 *   - and the trimmed lane's `0..1` was stretched over the WHOLE corridor
 *     rather than over the piece between the two stop lines, so a point a few
 *     metres into a ramp read the flat junction box at the end of it (0.44 m).
 *
 * `s0` is where this lane starts on its corridor and `dirSign` which way it runs
 * — the two numbers the link already records for E7's yields — and `run` is the
 * corridor length the lane actually covers.
 */
function packAlong(points, profile, { s0 = 0, dirSign = 1, run: covers } = {}) {
  const pts = new Float32Array(points.length * 3);
  const cum = new Float32Array(points.length);
  let run = 0;
  for (let i = 1; i < points.length; i += 1) {
    run += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    cum[i] = run;
  }
  const total = run || 1;
  const covered = covers === undefined ? profile.len : covers;
  for (let i = 0; i < points.length; i += 1) {
    const want = s0 + dirSign * (cum[i] / total) * covered;
    let k = 1;
    while (k < profile.cum.length - 1 && profile.cum[k] < want) k += 1;
    const span = profile.cum[k] - profile.cum[k - 1] || 1;
    const t = Math.min(1, Math.max(0, (want - profile.cum[k - 1]) / span));
    pts[i * 3] = points[i].x;
    pts[i * 3 + 1] = profile.ys[k - 1] + (profile.ys[k] - profile.ys[k - 1]) * t;
    pts[i * 3 + 2] = points[i].z;
  }
  return { pts, cum, len: run };
}

/** As `pack`, with the two end heights given and the interior interpolated —
 * a straight line in y across the junction, which on flat ground is exact. */
function packBetween(points, y0, y1) {
  const pts = new Float32Array(points.length * 3);
  const cum = new Float32Array(points.length);
  let run = 0;
  for (let i = 0; i < points.length; i += 1) {
    if (i > 0) run += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    cum[i] = run;
  }
  for (let i = 0; i < points.length; i += 1) {
    const t = run > 1e-9 ? cum[i] / run : 0;
    pts[i * 3] = points[i].x;
    pts[i * 3 + 1] = y0 + (y1 - y0) * t;
    pts[i * 3 + 2] = points[i].z;
  }
  return { pts, cum, len: run };
}

/** Which way a manoeuvre bends. The cross product of the two forward vectors:
 * positive is a right turn in a y-up world with +z south. */
function turnOf(fromX, fromZ, toX, toZ) {
  const cross = fromX * toZ - fromZ * toX;
  const dot = fromX * toX + fromZ * toZ;
  if (dot < -0.9) return "u";
  if (Math.abs(cross) < 0.2) return "straight";
  return cross > 0 ? "right" : "left";
}

const AXIS = ["ns", "ew", "ns", "ew"];   // DIR4 order: N, E, S, W

/** Three seconds of amber at the end of each green. Long enough to read as a
 * change rather than a jump, short enough that a queue does not think the
 * junction is broken. */
const AMBER = 3;

export function deriveLanes(state, network, ground) {
  const cfg = getConfig();
  const { lanes: perDir, stopLine } = cfg.road;
  const laneW = cfg.road.width / (2 * perDir);
  const nodeById = new Map(network.nodes.map((n) => [n.id, n]));

  const links = [];
  const lanes = [];

  // --- one lane each way along every corridor --------------------------------
  for (const corridor of network.corridors) {
    // Once per corridor, shared by both directions.
    const profile = profileOf(corridor, ground);
    const corridorLen = lengthOf(corridor.points);
    for (const dir of [0, 1]) {
      const along = dir === 0 ? corridor.points : [...corridor.points].reverse();
      if (along.length < 2) continue;
      const from = dir === 0 ? corridor.from : corridor.to;
      const to = dir === 0 ? corridor.to : corridor.from;
      const centre = offsetPolyline(along, laneW / 2);
      // Short of the junction BOX, not of the node's centre point. With a 4 m
      // lane offset and a 2 m stop line the two are the same distance, so a
      // right turn's two endpoints coincided and the connector came out zero
      // metres long — a car would have teleported round every corner, and the
      // only symptom was six connectors at a T arriving as two.
      //
      // An `end` node has no box to keep clear: the road simply stops there.
      const clear = (nodeId) => {
        const kind = nodeById.get(nodeId)?.kind;
        return (kind === "junction" || kind === "bend") ? corridor.half + stopLine : stopLine;
      };
      const cut = trim(centre, clear(from), clear(to));
      if (cut.length < 2) continue;
      // Where this lane starts on its corridor, and how much of it the lane
      // covers between the two stop lines (R4). Computed here rather than in
      // the link literal below, because `packAlong` needs them too — and a
      // second copy of "where does this lane start" is exactly the arithmetic
      // that went wrong.
      const s0 = dir === 0 ? clear(from) : corridorLen - clear(from);
      const dirSign = dir === 0 ? 1 : -1;
      const covers = Math.max(0, corridorLen - clear(from) - clear(to));
      const packed = packAlong(cut, profile, { s0, dirSign, run: covers });
      if (packed.len < 1e-6) continue;
      const lane = { id: lanes.length, corridor: corridor.id, dir, from, to };
      lanes.push(lane);
      links.push({
        id: links.length, kind: "block", lane: lane.id, corridor: corridor.id, dir,
        from, to, tiles: dir === 0 ? corridor.tiles : [...corridor.tiles].reverse(),
        // Where this link starts on its CORRIDOR, and which way it runs along
        // it. Recorded here because the derivation knows it and nothing else
        // does: E7 has to turn "somebody is standing at this point" into "stop
        // at this distance along this link", and the alternative is searching
        // back through a polyline for a number that was in hand (A45).
        s0, dirSign,
        ...packed, next: [], preds: [], entry: false, exit: false, turn: "",
      });
    }
  }

  /** The forward direction at a link's tail and head, as unit vectors. */
  const headingIn = (link) => {
    const n = link.pts.length;
    const dx = link.pts[n - 3] - link.pts[n - 6];
    const dz = link.pts[n - 1] - link.pts[n - 4];
    const len = Math.hypot(dx, dz) || 1;
    return { x: dx / len, z: dz / len };
  };
  const headingOut = (link) => {
    const dx = link.pts[3] - link.pts[0];
    const dz = link.pts[5] - link.pts[2];
    const len = Math.hypot(dx, dz) || 1;
    return { x: dx / len, z: dz / len };
  };

  // --- connectors through every node -----------------------------------------
  //
  // Every arriving lane joins every leaving lane except the one that would be a
  // U-turn. The grid has no turn restrictions, so this is the whole rule.
  const blocks = links.slice();
  const arriving = new Map();
  const leaving = new Map();
  for (const link of blocks) {
    if (!arriving.has(link.to)) arriving.set(link.to, []);
    if (!leaving.has(link.from)) leaving.set(link.from, []);
    arriving.get(link.to).push(link);
    leaving.get(link.from).push(link);
  }

  for (const node of network.nodes) {
    const ins = arriving.get(node.id) ?? [];
    const outs = leaving.get(node.id) ?? [];
    for (const into of ins) {
      const fin = headingIn(into);
      for (const out of outs) {
        // Same corridor and back the way we came: a U-turn.
        if (out.corridor === into.corridor && out.dir !== into.dir) continue;
        const fout = headingOut(out);
        const turn = turnOf(fin.x, fin.z, fout.x, fout.z);
        if (turn === "u") continue;
        const n = into.pts.length;
        const a = { x: into.pts[n - 3], z: into.pts[n - 1] };
        const b = { x: out.pts[0], z: out.pts[2] };
        const packed = packBetween(turnCurve(a, cornerOf(a, fin, b, fout), b), into.pts[n - 2], out.pts[1]);
        if (packed.len < 1e-6) continue;
        const link = {
          id: links.length, kind: "turn", lane: -1, corridor: -1, dir: into.dir,
          from: node.id, to: node.id, node: node.id, tiles: [node.tile],
          axis: AXIS[armOf(into, node)], turn,
          ...packed, next: [{ link: out.id, turn }], preds: [], entry: false, exit: false,
        };
        links.push(link);
        into.next.push({ link: link.id, turn });
      }
    }
  }

  /** Which arm of a node a link arrives by, as a DIR4 index. Taken from the
   * heading rather than the mask: a corridor may arrive at a node round a bend,
   * and it is the last few metres that decide which signal phase holds it. */
  function armOf(link, node) {
    const f = headingIn(link);
    let best = 0;
    let bestDot = -Infinity;
    for (let d = 0; d < 4; d += 1) {
      // The arm points OUT of the node; a link arriving travels the other way.
      const dot = -(DIR4[d].dx * f.x + DIR4[d].dy * f.z);
      if (dot > bestDot) { bestDot = dot; best = d; }
    }
    return best;
  }

  const byId = new Map(links.map((l) => [l.id, l]));
  for (const link of links) {
    for (const step of link.next) byId.get(step.link).preds.push(link.id);
  }
  for (const link of links) {
    const node = nodeById.get(link.to);
    link.exit = link.next.length === 0;
    link.entry = link.preds.length === 0 && link.kind === "block";
    if (link.kind === "block" && node) link.axis = AXIS[armOf(link, node)];
  }

  // --- the junction box (B8, A74) ----------------------------------------------
  // Which turns cross which, per junction. Derived once with the graph; the
  // traffic reads it to keep two crossing turns from being driven at once.
  const conflicts = deriveConflicts(links);

  // --- signals ----------------------------------------------------------------
  const signals = new Map();
  for (const node of network.nodes) {
    // Only where two real streets cross (T1, A51). The rule is in
    // `signals.js`, because the heads that stand at a junction and the nav
    // graph's crossings have to agree with the cars about which junctions have
    // one — three copies of it is a light the traffic drives straight through.
    if (!isSignalled(node, network.corridors)) continue;
    const cycle = 60;
    signals.set(node.id, { node: node.id, cycle, offset: jitter(node.tile, 97) * cycle });
  }

  /**
   * Does a block link have to give way where it arrives? (T1, A51.)
   *
   * Only at an UNSIGNALLED junction, and only off the priority AXIS — which at
   * a T is the stem and at a street crossing a driveway is the driveway. The
   * through road never stops: something has to hold priority or the cars drive
   * through each other at every junction on the grid, which since T1 is most of
   * them. The rule itself is in `signals.js` beside `isSignalled`, because the
   * pedestrians have to agree with it (E7's crossings).
   */
  function givesWay(link) {
    if (link.kind !== "block") return false;
    const node = nodeById.get(link.to);
    if (!node || node.kind !== "junction" || signals.has(node.id)) return false;
    return givesWayAt(node, network.corridors[link.corridor], network.corridors);
  }

  /** Which axis has green at time `t` seconds, or `'amber'` in between.
   * Periodic, pure, and never green both ways. */
  function phaseAt(nodeId, t) {
    const signal = signals.get(nodeId);
    if (!signal) return "ns";
    const { cycle, offset } = signal;
    const half = cycle / 2;
    const p = (((t + offset) % cycle) + cycle) % cycle;
    if (p < half - AMBER) return "ns";
    if (p < half) return "amber";
    if (p < cycle - AMBER) return "ew";
    return "amber";
  }

  /** Position and unit tangent `s` metres along a link, written into `out` so
   * a frame of a thousand cars allocates nothing. Clamped at both ends. */
  function sample(link, s, out) {
    const cum = link.cum;
    const last = cum.length - 1;
    const d = s < 0 ? 0 : s > link.len ? link.len : s;
    let i = 1;
    while (i < last && cum[i] < d) i += 1;
    const span = cum[i] - cum[i - 1];
    const t = span > 1e-9 ? (d - cum[i - 1]) / span : 0;
    const a = (i - 1) * 3;
    const b = i * 3;
    out.x = link.pts[a] + (link.pts[b] - link.pts[a]) * t;
    out.y = link.pts[a + 1] + (link.pts[b + 1] - link.pts[a + 1]) * t;
    out.z = link.pts[a + 2] + (link.pts[b + 2] - link.pts[a + 2]) * t;
    let tx = link.pts[b] - link.pts[a];
    let tz = link.pts[b + 2] - link.pts[a + 2];
    const len = Math.hypot(tx, tz) || 1;
    out.tx = tx / len;
    out.tz = tz / len;
    return out;
  }

  return {
    lanes,
    links,
    nodes: network.nodes,
    signals,
    phaseAt,
    givesWay,
    sample,
    /** Turn link id → the turn links at the same junction whose paths it crosses. */
    conflicts,
    stats: {
      lanes: lanes.length,
      links: links.length,
      blocks: links.filter((l) => l.kind === "block").length,
      turns: links.filter((l) => l.kind === "turn").length,
      signals: signals.size,
    },
  };
}

/** A car's width (the kit's body is ±0.055 of a tile, 2.2 m) and the sweep of
 * its corners on a curve: two paths closer than this anywhere in the box
 * cannot both be driven at once (B8). At 2.2 exactly, a car coming out of one
 * turn and a car crossing near the end of it touched at the corners on the
 * played city. Two straights along one street keep their lanes through the
 * box, 4 m apart (`cornerOf`), so they stay clear of it. */
const CONFLICT_M = 3.0;

/**
 * Turn link id → the turn links at the same junction it conflicts with.
 *
 * Every pair of turns at a node whose paths pass within `CONFLICT_M` — a left
 * across the oncoming straight, two turns into the same lane, a right across
 * the cross street — except two turns off the SAME approach: those share a
 * start because they are one queue, and the following model keeps them apart.
 * Two straights along one street run in their own lanes and never meet.
 */
function deriveConflicts(links) {
  const byNode = new Map();
  for (const link of links) {
    if (link.kind !== "turn") continue;
    if (byNode.has(link.node)) byNode.get(link.node).push(link);
    else byNode.set(link.node, [link]);
  }
  const out = new Map();
  const add = (a, b) => {
    if (out.has(a)) out.get(a).push(b);
    else out.set(a, [b]);
  };
  for (const turns of byNode.values()) {
    for (let i = 0; i < turns.length; i += 1) {
      for (let j = i + 1; j < turns.length; j += 1) {
        const a = turns[i];
        const b = turns[j];
        if (a.preds[0] === b.preds[0]) continue;
        // The same two streets driven in opposite directions — round a bend,
        // or a left and the mirrored right at a crossroads — are on their own
        // sides of the road and never cross. At a tight bend the two curves
        // pinch under a car's width, and listing them held a car on the played
        // city for the whole two minutes it was watched, behind oncoming
        // traffic that never stopped (B8).
        if (streetOf(links, a.preds[0]) === streetOf(links, b.next[0].link)
          && streetOf(links, a.next[0].link) === streetOf(links, b.preds[0])) continue;
        if (!pathsWithin(a, b, CONFLICT_M)) continue;
        add(a.id, b.id);
        add(b.id, a.id);
      }
    }
  }
  return out;
}

/**
 * Where a lane arriving at `a` heading `da` would meet a lane leaving `b`
 * heading `db` — the corner a turn bends round. Parallel lines (a straight
 * through) have no corner, so the midpoint is used and the "curve" is a line
 * that keeps its lane. Clamped to the span between the two ends, so a nearly
 * parallel pair cannot throw the control point across the map.
 */
function cornerOf(a, da, b, db) {
  const cross = da.x * db.z - da.z * db.x;
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  if (Math.abs(cross) < 0.2) return mid;
  const s = ((b.x - a.x) * db.z - (b.z - a.z) * db.x) / cross;
  const span = Math.hypot(b.x - a.x, b.z - a.z);
  if (!(s > 0) || s > span) return mid;
  return { x: a.x + da.x * s, z: a.z + da.z * s };
}

/** Which corridor a block link belongs to. */
function streetOf(links, id) {
  return links[id]?.corridor ?? -1;
}

/**
 * Do two turns' paths come within `limit` of each other anywhere?
 *
 * A yes/no, not a distance, so it stops at the first close pair of segments,
 * and two turns whose bounding boxes are further apart than `limit` — a right
 * turn on each of two opposite corners — are not compared at all. Measuring
 * the least distance of every pair made the lane graph of a 96-tile city 48 ms
 * instead of 11, on a derivation that runs on every build action (B8).
 */
function pathsWithin(a, b, limit) {
  const ba = boundsOf(a);
  const bb = boundsOf(b);
  if (ba.x0 - bb.x1 > limit || bb.x0 - ba.x1 > limit || ba.z0 - bb.z1 > limit || bb.z0 - ba.z1 > limit) return false;
  const p = a.pts;
  const q = b.pts;
  for (let i = 3; i < p.length; i += 3) {
    for (let j = 3; j < q.length; j += 3) {
      if (segmentGap(p[i - 3], p[i - 1], p[i], p[i + 2], q[j - 3], q[j - 1], q[j], q[j + 2]) < limit) return true;
    }
  }
  return false;
}

/** A link's ground-plane bounding box, computed once and kept on the link. */
function boundsOf(link) {
  if (link.bounds) return link.bounds;
  let x0 = Infinity; let z0 = Infinity; let x1 = -Infinity; let z1 = -Infinity;
  for (let i = 0; i < link.pts.length; i += 3) {
    x0 = Math.min(x0, link.pts[i]); x1 = Math.max(x1, link.pts[i]);
    z0 = Math.min(z0, link.pts[i + 2]); z1 = Math.max(z1, link.pts[i + 2]);
  }
  link.bounds = { x0, z0, x1, z1 };
  return link.bounds;
}

function segmentGap(ax, az, bx, bz, cx, cz, dx, dz) {
  const side = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const d1 = side(cx, cz, dx, dz, ax, az);
  const d2 = side(cx, cz, dx, dz, bx, bz);
  const d3 = side(ax, az, bx, bz, cx, cz);
  const d4 = side(ax, az, bx, bz, dx, dz);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(
    pointGap(ax, az, cx, cz, dx, dz), pointGap(bx, bz, cx, cz, dx, dz),
    pointGap(cx, cz, ax, az, bx, bz), pointGap(dx, dz, ax, az, bx, bz),
  );
}

function pointGap(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const len = vx * vx + vz * vz;
  const t = len > 1e-12 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / len)) : 0;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

// The vehicles a city sends somewhere (slice B3b).
//
// The traffic in `traffic.js` is ambient: cars appear on a link in proportion
// to its load and leave at the end of it, and none of them is going anywhere in
// particular. A fire engine is the opposite — it has an errand, a route and a
// reason to be where it is, and a player can watch it answer the fire they can
// see burning.
//
// Renderer-local and derived (ruling 037): a station is a building in `state`,
// a fire is a tile flag, and everything else here is a function of those two
// and the lane graph. Nothing is written back, and `?life=0` freezes it like
// everything else in this directory.
//
// **Read from the TILE flags**, not from `building.flags`, for the reason B1b
// documents: the record's field is created as 0 and written by nothing.

import { FLAG_BURNING } from "../constants-mirror.js";

/** The two kinds: which building sends them, what colour they are, and which
 * of `vehicle-spec.js`'s bodies they wear. */
export const KINDS = Object.freeze({
  engine: { def: "fireStation", colour: 0xc03028, body: 2 },
  patrol: { def: "policeStation", colour: 0x2b4c8c, body: 1 },
});

/** Metres a second. An engine is quicker than the traffic and a patrol is not. */
export const SPEED = Object.freeze({ engine: 16, patrol: 9 });

const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

/** The block links nearest a point, nearest first.
 *
 * Several, not one, and that is not a refinement: the lane graph is DIRECTED,
 * so the lane nearest a door may be the one heading away from where the car
 * has to go, and a route from it does not exist. A patrol leaving a station in
 * a played city failed for exactly that — one station, one beat, one nearest
 * lane each, and no route between them at all. A car leaves by whichever lane
 * it can.
 */
export function nearestLinks(lanes, x, z, count = 1) {
  const found = [];
  for (const link of lanes.links) {
    if (link.kind !== "block") continue;
    // The ends are enough: a block link is a straight run of a lane, and the
    // nearest END is within half a link of the nearest point on it.
    const n = link.pts.length / 3;
    let best;
    for (let i = 0; i < n; i += 1) {
      const d = dist2(link.pts[i * 3], link.pts[i * 3 + 2], x, z);
      if (!best || d < best.d) best = { d, link, s: (i / Math.max(1, n - 1)) * (link.len ?? 0) };
    }
    if (best) found.push(best);
  }
  found.sort((a, b) => a.d - b.d);
  return found.slice(0, count);
}

/** The nearest one, for callers that only want somewhere to stand. */
export function nearestLink(lanes, x, z) {
  return nearestLinks(lanes, x, z, 1)[0];
}

/**
 * The shortest way from one link to another, as a list of link ids.
 *
 * Dijkstra over `link.next`, which is the lane graph's own adjacency — the one
 * place this lane builds a planner, and it runs once per errand rather than per
 * frame. Returns `undefined` when the two are not connected, which happens: a
 * city can have two road networks and a station on the wrong one.
 */
export function routeBetween(lanes, fromId, toId, limit = 20000) {
  if (fromId === toId) return [fromId];
  const byId = new Map(lanes.links.map((l) => [l.id, l]));
  const cost = new Map([[fromId, 0]]);
  const back = new Map();
  // A small binary heap would be faster; a city has a few thousand links and
  // this runs when a fire starts, so a sorted frontier is honest and simple.
  const frontier = [{ id: fromId, at: 0 }];
  let visited = 0;
  while (frontier.length > 0 && visited < limit) {
    frontier.sort((a, b) => a.at - b.at);
    const { id, at } = frontier.shift();
    if (at > (cost.get(id) ?? Infinity)) continue;
    visited += 1;
    if (id === toId) break;
    const link = byId.get(id);
    if (!link) continue;
    for (const step of link.next ?? []) {
      const next = byId.get(step.link);
      if (!next) continue;
      const through = at + (next.len ?? 0);
      if (through >= (cost.get(step.link) ?? Infinity)) continue;
      cost.set(step.link, through);
      back.set(step.link, id);
      frontier.push({ id: step.link, at: through });
    }
  }
  if (!cost.has(toId)) return undefined;
  const route = [toId];
  while (route[0] !== fromId) {
    const prev = back.get(route[0]);
    if (prev === undefined) return undefined;
    route.unshift(prev);
  }
  return route;
}

/** Every station of a kind, as a point at its door. */
export function stationsOf(state, def) {
  const out = [];
  for (const b of state.buildings) {
    if (b.def !== def) continue;
    out.push({ id: b.id, x: b.x + b.w / 2, y: b.y + b.h / 2 });
  }
  return out;
}

/** Every tile alight, grouped into fires — one errand a fire, not a tile.
 *
 * A fire that has spread across four tiles is one thing to drive to, and B1a
 * made fires that spread. Connected tiles are one call. */
export function firesIn(state) {
  const w = state.width;
  const seen = new Set();
  const fires = [];
  for (let i = 0; i < state.tiles.flags.length; i += 1) {
    if ((state.tiles.flags[i] & FLAG_BURNING) === 0 || seen.has(i)) continue;
    const tiles = [];
    const queue = [i];
    seen.add(i);
    while (queue.length > 0) {
      const at = queue.pop();
      tiles.push(at);
      const x = at % w;
      const y = (at - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= state.height) continue;
        const j = ny * w + nx;
        if ((state.tiles.flags[j] & FLAG_BURNING) === 0 || seen.has(j)) continue;
        seen.add(j);
        queue.push(j);
      }
    }
    let sx = 0;
    let sy = 0;
    for (const t of tiles) { sx += t % w; sy += (t - (t % w)) / w; }
    fires.push({ id: Math.min(...tiles), tiles, x: sx / tiles.length + 0.5, y: sy / tiles.length + 0.5 });
  }
  return fires;
}

/** Which station answers which fire: the nearest one, and one engine a fire.
 *
 * Two fires near one station are two engines from it — a station with nothing
 * to send is a station that has not been built yet, and the alternative (a
 * queue) is a simulation the renderer has no business running. */
export function dispatch(fires, stations) {
  const calls = [];
  for (const fire of fires) {
    let best;
    for (const station of stations) {
      const d = dist2(station.x, station.y, fire.x, fire.y);
      if (!best || d < best.d) best = { d, station };
    }
    if (!best) continue;
    calls.push({ fire: fire.id, station: best.station.id, from: best.station, to: fire });
  }
  return calls;
}

/**
 * The service vehicles of one city.
 *
 * Renderer-local and timed by the caller (ruling 037): `update(dt)` takes a
 * delta in seconds and nothing here reads a clock, which is what lets
 * `?life=0` freeze an engine mid-street for a screenshot.
 *
 * An engine exists while its fire does. A patrol exists while its station does
 * and drives a loop of the worst crime in its coverage. Neither is ever a
 * function of the camera (D7's invariant): the camera decides which are DRAWN.
 */
export function createServices(state, model, options = {}) {
  const lanes = model.lanes;
  const live = options.life !== false;
  const tileM = model.tileM;
  /** fire id → the engine answering it. */
  const engines = new Map();
  /** station id → its patrol. */
  const patrols = new Map();
  const out = { x: 0, y: 0, z: 0, tx: 1, tz: 0 };
  let clock = 0;

  const byId = new Map(lanes.links.map((l) => [l.id, l]));
  const linkAt = (x, y) => nearestLink(lanes, x * tileM, y * tileM);

  const TRIES = 8;
  function vehicle(kind, from, to) {
    // The nearest few of each, because the graph is directed and the nearest
    // lane to a door may head away from the errand — and a lane you cannot
    // drive OFF is not a place to start. Measured on the played city: the three
    // lanes nearest a station door were stubs that reached only themselves,
    // while the main network — 8,426 of 8,902 links — was the fourth.
    const starts = nearestLinks(lanes, from.x * tileM, from.y * tileM, TRIES)
      .filter((c) => (c.link.next ?? []).length > 0);
    const ends = nearestLinks(lanes, to.x * tileM, to.y * tileM, TRIES)
      .filter((c) => (c.link.preds ?? []).length > 0);
    for (const start of starts) {
      for (const end of ends) {
        const made = leg(kind, start.link.id, start.s, end.link.id);
        if (made) return made;
      }
    }
    return undefined;
  }

  /** The next leg of an errand, from where the vehicle actually IS.
   *
   * A patrol that re-routed from its station every time it reached a beat
   * teleported back to the door and never appeared to move at all — the counts
   * said one patrol the whole time. */
  function leg(kind, fromId, s, toId) {
    const route = routeBetween(lanes, fromId, toId);
    if (!route) return undefined;
    return { kind, route, at: 0, s, speed: SPEED[kind], arrived: false };
  }

  /** The worst crime in a station's reach, worst first.
   *
   * A LIST, not the winner: the road network has more than one component — a
   * played 64×64 has 8,426 links in the main one and 476 in stubs and islands —
   * so the worst tile may be somewhere no car can drive to. The caller takes
   * the first one that routes, which is what a patrol car would do.
   */
  function crimeBeats(station, skip) {
    const reach = 12;
    const found = [];
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        const x = Math.round(station.x + dx);
        const y = Math.round(station.y + dy);
        if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
        const i = y * state.width + x;
        if (i === skip) continue;
        if ((state.tiles.road[i] & 16) === 0) continue;
        found.push({ crime: state.tiles.crime[i], i, x: x + 0.5, y: y + 0.5 });
      }
    }
    found.sort((a, b) => b.crime - a.crime);
    return found.slice(0, 16);
  }

  /** Brings the fleet in line with what the city is doing. */
  function muster() {
    const fires = firesIn(state);
    const stations = stationsOf(state, KINDS.engine.def);
    const calls = dispatch(fires, stations);
    const wanted = new Set(calls.map((c) => c.fire));
    for (const id of [...engines.keys()]) if (!wanted.has(id)) engines.delete(id);
    for (const call of calls) {
      if (engines.has(call.fire)) continue;
      const made = vehicle("engine", call.from, call.to);
      if (made) engines.set(call.fire, made);
    }

    const beats = stationsOf(state, KINDS.patrol.def);
    for (const station of beats) {
      if (patrols.has(station.id)) continue;
      for (const beat of crimeBeats(station, -1)) {
        const made = vehicle("patrol", station, beat);
        if (!made) continue;
        patrols.set(station.id, { ...made, station, beat: beat.i });
        break;
      }
    }
    // A station that burned down takes its patrol with it.
    const standing = new Set(beats.map((s) => s.id));
    for (const id of [...patrols.keys()]) if (!standing.has(id)) patrols.delete(id);
  }

  /** One step along a route. Returns false when the vehicle has arrived. */
  function drive(v, dt) {
    const link = byId.get(v.route[v.at]);
    if (!link) return false;
    v.s += v.speed * dt;
    // `len`, which is what `lanes.js` calls it — `length` on a link is
    // undefined, and a NaN distance moves a vehicle nowhere at all while every
    // count still says it is there.
    while (v.s >= (byId.get(v.route[v.at])?.len ?? 0)) {
      v.s -= byId.get(v.route[v.at])?.len ?? 0;
      if (v.at >= v.route.length - 1) { v.s = byId.get(v.route[v.at])?.len ?? 0; return false; }
      v.at += 1;
    }
    return true;
  }

  return {
    update(dt) {
      if (!live) { muster(); return; }
      clock += dt;
      muster();
      for (const v of engines.values()) {
        if (!drive(v, dt)) v.arrived = true;
      }
      for (const [id, v] of patrols) {
        if (drive(v, dt)) continue;
        // The beat: the next worst tile, from where the car is standing, which
        // is a loop because crime moves and the last stop is skipped.
        const here = v.route[v.at];
        let moved;
        for (const next of crimeBeats(v.station, v.beat)) {
          for (const to of nearestLinks(lanes, next.x * tileM, next.y * tileM, TRIES)) {
            const made = leg("patrol", here, v.s, to.link.id);
            if (!made) continue;
            moved = { ...made, station: v.station, beat: next.i };
            break;
          }
          if (moved) break;
        }
        if (moved) patrols.set(id, moved);
        else patrols.delete(id);
      }
    },

    /** Everything on an errand right now — never a function of the camera. */
    count() {
      return engines.size + patrols.size;
    },

    stats() {
      let arrived = 0;
      for (const v of engines.values()) if (v.arrived) arrived += 1;
      return { engines: engines.size, patrols: patrols.size, atTheFire: arrived };
    },

    /** For a test, and for `lanes_dump`: where each vehicle is, in tiles. */
    fleet() {
      const list = [];
      for (const [fire, v] of engines) list.push({ kind: "engine", fire, ...place(v) });
      for (const [station, v] of patrols) list.push({ kind: "patrol", station, ...place(v) });
      return list;
    },

    pose(pools, push, bounds, near = false) {
      for (const v of [...engines.values(), ...patrols.values()]) {
        const link = byId.get(v.route[v.at]);
        if (!link) continue;
        if (bounds && !onScreen(link, bounds, tileM)) continue;
        const body = KINDS[v.kind].body;
        const pool = (near && pools[`car${body}_near`]) || pools[`car${body}`];
        if (!pool) continue;
        lanes.sample(link, Math.min(v.s, link.len ?? 0), out);
        push(pool, out.x / tileM, out.y / tileM, out.z / tileM, 1, 1, 1,
          KINDS[v.kind].colour, Math.atan2(-out.tz, out.tx));
      }
    },
  };

  function place(v) {
    const link = byId.get(v.route[v.at]);
    if (!link) return { x: 0, y: 0 };
    lanes.sample(link, Math.min(v.s, link.len ?? 0), out);
    return { x: out.x / tileM, y: out.z / tileM, arrived: v.arrived === true };
  }
}

/** Is any of this link inside the view? The same test the traffic uses. */
function onScreen(link, bounds, tileM) {
  const n = link.pts.length / 3;
  for (let i = 0; i < n; i += 1) {
    const x = link.pts[i * 3] / tileM;
    const z = link.pts[i * 3 + 2] / tileM;
    if (x >= bounds.x0 - 1 && x <= bounds.x1 + 1 && z >= bounds.y0 - 1 && z <= bounds.y1 + 1) return true;
  }
  return false;
}

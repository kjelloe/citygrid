// Boats (slice T4b; A67, A68, ruling 037).
//
// Three kinds, one module, because they are the same arithmetic:
//
//   moored   — at a marina, in slots along its water side. They do not move.
//   sailing  — two or three on a body, on OPEN water, turning at the shore.
//   plying   — a ferry or a cargo ship, from its building to the edge and back.
//
// Renderer-local and timed by the caller like everything else in
// `client/life/`: `update(dt)` takes a delta in seconds, nothing here asks the
// machine what time it is, and `?life=0` means the caller stops calling.
//
// A boat never crosses a shore. That is the one invariant worth a test, and it
// is not "it looks right" — a vessel on land is the single most obvious defect
// this slice can ship, and a screenshot of a still boat cannot tell you whether
// the moving one will end up in a field.

import { getConfig } from "../world/config.js";
import { jitter } from "../world/hash.js";
import { sampleLine } from "./train.js";

/** How far from a shore a sailing boat keeps: `ringOf` counts 0 at the water's
 * edge, so 2 is a tile of clear water between the hull and the land. */
const CLEAR_OF_SHORE = 2;

/** A heading, as a unit vector, from an integer 0..7. */
function heading(k) {
  const a = (k & 7) * (Math.PI / 4);
  return { x: Math.cos(a), z: Math.sin(a) };
}

/**
 * The boats of one city.
 *
 * `options.life === false` leaves them where they are — the same switch the
 * traffic, the crowd and the train take.
 */
export function createBoats(state, model, options = {}) {
  const cfg = getConfig();
  const live = options.life !== false;
  const tileM = model.tileM;
  const spec = cfg.boat;
  const water = model.water;

  /** Is this point open water a boat may be on? In TILES. */
  function sailable(tx, tz) {
    if (tx < 0 || tz < 0 || tx >= state.width || tz >= state.height) return false;
    const tile = (tz | 0) * state.width + (tx | 0);
    return water.isWater(tile) && water.ringOf(tile) >= CLEAR_OF_SHORE;
  }

  /** The water level at a point, so a hull floats rather than following the
   * bed. `waterLevelAt` is in metres and takes metres. */
  const surface = (tx, tz) => model.waterLevelAt(tx * tileM, tz * tileM) ?? 0;

  const moored = [];
  const sailing = [];
  const plying = [];

  const buildings = state.buildings;
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    if (b.def === "marina") {
      // Along the marina's water side, one boat a slot. The side is whichever
      // of the four has water beside it; a 2×2 on a shore has at least one.
      const slots = mooringsFor(b);
      for (let k = 0; k < slots.length && moored.length < spec.mooredCap; k += 1) moored.push(slots[k]);
    } else if (b.def === "ferryTerminal" || b.def === "freightPort") {
      const route = routeFrom(b);
      if (route) plying.push(route);
    }
  }

  // Two or three a body, on the bodies big enough to have open water in them.
  for (const body of water.bodies) {
    if (body.open < spec.openTilesPerBoat) continue;
    const want = Math.min(spec.perBody, Math.max(1, Math.floor(body.open / spec.openTilesPerBoat)));
    let placed = 0;
    // A hash WALK over the body's own tiles rather than a random pick: the
    // same body always carries the same boats in the same places, so a
    // screenshot is a screenshot of this city and not of this run.
    for (let k = 0; k < body.tiles.length && placed < want; k += 1) {
      const tile = body.tiles[(k * 97 + body.id * 31) % body.tiles.length];
      // At `CLEAR_OF_SHORE`, not beyond it: `ringOf` is capped at
      // `water.shelf + 1`, which is 2 on the shipped numbers, so a rule asking
      // for 3 asks for a ring that does not exist and places no boat at all.
      if (water.ringOf(tile) < CLEAR_OF_SHORE) continue;
      const tx = (tile % state.width) + 0.5;
      const tz = ((tile - (tile % state.width)) / state.width) + 0.5;
      if (!sailable(tx, tz)) continue;
      sailing.push({
        // Its seed tile is its identity (B11): the hash walk always puts this
        // boat on this tile, so a rebuild can find it again.
        key: `s${tile}`,
        x: tx, z: tz, dir: (jitter(tile, 17) * 8) | 0, body: body.id,
        speed: spec.sailSpeed * (0.7 + jitter(tile, 19) * 0.6),
      });
      placed += 1;
    }
  }

  /**
   * A marina's moorings: the water ORTHOGONALLY beside it, two boats a tile.
   *
   * Not the whole ring. The corners put hulls diagonally off the building, and
   * on a straight bank the first cut came out as eight white blocks in a
   * ruler-straight line down the shore — which reads as cargo on a quay, not
   * as boats at a pontoon. Orthogonal only, and each hull nudged along its
   * berth by a hash, so the row has the unevenness a row of moored boats has.
   */
  function mooringsFor(b) {
    const out = [];
    for (let dy = -1; dy <= b.h; dy += 1) {
      for (let dx = -1; dx <= b.w; dx += 1) {
        const beside = (dx === -1 || dx === b.w) !== (dy === -1 || dy === b.h);
        if (!beside) continue;
        const tx = b.x + dx;
        const tz = b.y + dy;
        if (tx < 0 || tz < 0 || tx >= state.width || tz >= state.height) continue;
        const tile = tz * state.width + tx;
        if (!water.isWater(tile)) continue;
        // Along the tile, not across it: two hulls side by side read as a pair
        // of berths rather than as one wide boat.
        const along = dx === -1 || dx === b.w;
        for (let n = 0; n < 2; n += 1) {
          const drift = (jitter(tile * 4 + n, 53) - 0.5) * 0.22;
          out.push({
            x: tx + (along ? 0.5 + drift : 0.3 + n * 0.4),
            z: tz + (along ? 0.3 + n * 0.4 : 0.5 + drift),
            dir: along ? 2 : 0,
            id: tile * 4 + n,
          });
        }
      }
    }
    return out;
  }

  /**
   * A vessel's route: from the water beside its building to the nearest EDGE
   * tile of the same body, ALONG the water.
   *
   * A breadth-first walk over the body, not a straight line. The first cut was
   * a straight line and refused any terminal whose crossing met a headland —
   * which sounds principled and is a limitation nobody asked for: a real ferry
   * follows the channel. It also made the freight port's own gate picture
   * impossible, because the shore this seed offers a 3×2 is a berth with one
   * tile of water at its corner.
   */
  function routeFrom(b) {
    let start = -1;
    for (let dy = -1; dy <= b.h && start < 0; dy += 1) {
      for (let dx = -1; dx <= b.w && start < 0; dx += 1) {
        const tx = b.x + dx;
        const tz = b.y + dy;
        if (tx < 0 || tz < 0 || tx >= state.width || tz >= state.height) continue;
        if (water.isWater(tz * state.width + tx)) start = tz * state.width + tx;
      }
    }
    if (start < 0) return undefined;
    const body = water.bodyOf(start);
    if (!body || !body.edge) return undefined;

    const cameFrom = new Map([[start, -1]]);
    const queue = [start];
    let reached = -1;
    for (let head = 0; head < queue.length && reached < 0; head += 1) {
      const i = queue[head];
      const x = i % state.width;
      const z = (i - x) / state.width;
      if (x === 0 || z === 0 || x === state.width - 1 || z === state.height - 1) { reached = i; break; }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= state.width || nz >= state.height) continue;
        const j = nz * state.width + nx;
        if (cameFrom.has(j) || !water.isWater(j)) continue;
        cameFrom.set(j, i);
        queue.push(j);
      }
    }
    if (reached < 0) return undefined;

    const points = [];
    for (let i = reached; i >= 0; i = cameFrom.get(i)) {
      points.push({ x: (i % state.width) + 0.5, z: ((i - (i % state.width)) / state.width) + 0.5 });
    }
    points.reverse();   // terminal first, edge last
    if (points.length < 2) return undefined;
    const cum = [0];
    for (let k = 1; k < points.length; k += 1) {
      cum.push(cum[k - 1] + Math.hypot(points[k].x - points[k - 1].x, points[k].z - points[k - 1].z));
    }
    return {
      kind: b.def === "freightPort" ? "cargo" : "ferry",
      // The terminal's building id, which the engine owns and never reuses.
      key: `v${b.id}`,
      points, cum, length: cum[cum.length - 1], at: 0, dir: 1, waited: 0,
      speed: b.def === "freightPort" ? spec.cargoSpeed : spec.ferrySpeed,
      wake: [],
    };
  }

  function sail(boat, dt) {
    const step = boat.speed * dt / tileM;
    const h = heading(boat.dir);
    const nx = boat.x + h.x * step;
    const nz = boat.z + h.z * step;
    // Look a boat's length ahead, not at its own middle: a hull that turns
    // when its centre reaches the shore has already put its bow on the beach.
    const ahead = spec.length / tileM;
    if (sailable(nx + h.x * ahead, nz + h.z * ahead)) {
      boat.x = nx;
      boat.z = nz;
      return;
    }
    // Turn, and keep turning until something is clear. Eight headings, so this
    // ends; a boat in a pocket with none of them turns on the spot, which is a
    // boat in a pocket.
    for (let k = 1; k <= 8; k += 1) {
      const turned = (boat.dir + k) & 7;
      const t = heading(turned);
      if (!sailable(boat.x + t.x * ahead, boat.z + t.z * ahead)) continue;
      boat.dir = turned;
      return;
    }
  }

  function ply(vessel, dt) {
    if (vessel.waited > 0) {
      vessel.waited -= dt;
      return;
    }
    vessel.at += vessel.dir * vessel.speed * dt / tileM;
    if (vessel.at >= vessel.length) { vessel.at = vessel.length; vessel.dir = -1; vessel.waited = spec.dwell; }
    if (vessel.at <= 0) { vessel.at = 0; vessel.dir = 1; vessel.waited = spec.dwell; }
    // The wake: where the vessel has been, newest first, a few lengths of it.
    const p = along(vessel);
    vessel.wake.unshift({ x: p.x, z: p.z });
    if (vessel.wake.length > spec.wake) vessel.wake.length = spec.wake;
  }

  /** Where a plying vessel is, and which way it is pointing, in tiles. The
   * same arc-length walk the train takes along a rail corridor — one copy of
   * "sample a polyline", not two (T3, `client/life/train.js`). */
  const POINT = { x: 0, y: 0, z: 0, tx: 1, tz: 0 };
  function along(vessel) {
    sampleLine(vessel.points, vessel.cum, vessel.at, POINT);
    return { x: POINT.x, z: POINT.z, tx: POINT.tx * vessel.dir, tz: POINT.tz * vessel.dir };
  }

  // The boats from before this rebuild (B11). Nothing a road build does moves
  // a water body, so without this a handful of hulls jump back to their seed
  // tile every time the player paves anything.
  if (options.carry) {
    const was = new Map(options.carry.map((boat) => [boat.key, boat]));
    for (const boat of sailing) {
      const saved = was.get(boat.key);
      if (!saved) continue;
      boat.x = saved.x;
      boat.z = saved.z;
      boat.dir = saved.dir;
    }
    for (const vessel of plying) {
      const saved = was.get(vessel.key);
      if (!saved) continue;
      vessel.at = Math.min(saved.at, vessel.length);
      vessel.dir = saved.dir;
      vessel.waited = saved.waited;
    }
  }

  return {
    /** Every hull that MOVES, by its own key (B11). The moorings are static and
     * re-derive identically, so they are not carried. */
    snapshot() {
      const out = sailing.map((boat) => ({ key: boat.key, x: boat.x, z: boat.z, dir: boat.dir }));
      for (const vessel of plying) {
        out.push({ key: vessel.key, at: vessel.at, dir: vessel.dir, waited: vessel.waited });
      }
      return out;
    },

    update(dt) {
      if (!live) return;
      for (const boat of sailing) sail(boat, dt);
      for (const vessel of plying) ply(vessel, dt);
    },

    count() {
      return moored.length + sailing.length + plying.length;
    },

    stats() {
      return {
        moored: moored.length,
        sailing: sailing.length,
        plying: plying.length,
        routes: plying.map((v) => v.kind),
      };
    },

    /** Every hull, in TILES — for a test and for a dump. */
    fleet() {
      const out = moored.map((m) => ({ kind: "moored", x: m.x, z: m.z }));
      for (const b of sailing) out.push({ kind: "sailing", x: b.x, z: b.z, dir: b.dir });
      for (const v of plying) out.push({ kind: v.kind, ...along(v) });
      return out;
    },

    pose(pools, push, bounds) {
      let posed = 0;
      const put = (pool, x, z, spin, colour, lift) => {
        if (!pool) return;
        if (bounds && (x < bounds.x0 - 2 || x > bounds.x1 + 2 || z < bounds.z0 - 2 || z > bounds.z1 + 2)) return;
        push(pool, x, surface(x, z) / tileM + lift, z, 1, 1, 1, colour, spin);
        posed += 1;
      };
      for (const m of moored) {
        put(pools.moored ?? pools.boat, m.x, m.z, m.dir * (Math.PI / 4), spec.hullColour, 0);
      }
      for (const b of sailing) {
        put(pools.boat, b.x, b.z, -b.dir * (Math.PI / 4), spec.sailColour, 0);
      }
      for (const v of plying) {
        const p = along(v);
        const h = Math.atan2(-p.tz, p.tx);
        const hull = v.kind === "cargo" ? (pools.cargo ?? pools.ferry) : pools.ferry;
        put(hull, p.x, p.z, h, v.kind === "cargo" ? spec.cargoColour : spec.ferryColour, 0);
        // The wake, oldest and faintest last. Flat quads on the surface, not
        // a ribbon: a ribbon is geometry rebuilt every frame for a thing that
        // is three metres of foam.
        for (let k = 1; k < v.wake.length; k += 1) {
          const w = v.wake[k];
          if (bounds && (w.x < bounds.x0 - 2 || w.x > bounds.x1 + 2)) continue;
          push(pools.wake, w.x, surface(w.x, w.z) / tileM + 0.002, w.z,
            1 - k / v.wake.length, 1, 1 - k / v.wake.length, spec.wakeColour, h);
          posed += 1;
        }
      }
      return posed;
    },
  };
}

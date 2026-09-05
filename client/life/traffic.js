// Cars on the lane graph (slice V1; ruling 037, specs/engine/09-life.md §9.1).
//
// The engine has computed a per-tile commuter load since N7 — `tiles.traffic`,
// hashed state, one byte a tile — and the only things that ever read it were an
// overlay tint and a row of the inspector. This is the other reader.
//
// **Nothing here is state.** No vehicle, no position, no float enters the
// reducer; a car is a local simulation over a derived graph, and two clients
// showing the same city show the same traffic without agreeing on anything,
// because every choice a car makes is a hash of an integer that is already in
// state (rulings 032, 037). The engine decides how BUSY a road is; this decides
// what busy looks like.
//
// Renderer-local, so it is the one part of cityviewer that remembers something
// between frames — which is why it lives in `client/life/` and not in
// `client/world/`.

import { jitter } from "../world/hash.js";
import { getConfig } from "../world/config.js";
import { NET_PRESENT } from "../constants-mirror.js";

/** A car, in metres. The mesh is 0.22 tiles long and a tile is 20 m. */
export const CAR_M = 4.4;

// The intelligent-driver model, which is four constants and one equation.
// Chosen for behaviour rather than realism: S0 and HEADWAY set what a queue
// looks like, A and B set how quickly it discharges, and DELTA is the standard
// 4. What it buys over "move at a fixed speed and stop if too close" is that a
// jam forms and clears from the front, which is the thing the reference shot
// shows and the thing a player recognises.
const S0 = 2;          // the gap a stopped car leaves, metres
const HEADWAY = 1.2;   // seconds of gap per metre per second of speed
const ACCEL = 1.6;     // m/s²
const BRAKE = 2.4;     // m/s², comfortable
const DELTA = 4;

/** How hard a car may brake for a signal it is about to reach. Higher than
 * `BRAKE` because a light going amber is not a comfortable stop. */
const SIGNAL_BRAKE = 4.5;

/** How much a fully loaded road slows its traffic down.
 *
 * This is what makes the engine's load visible, and it took a measurement to
 * find. Spawning cars at the speed limit and relying on a density target alone
 * gave a road that ran at 9 m/s with big gaps whatever the load: the target was
 * never the binding constraint, because you cannot push more cars onto a road
 * than free flow at a 1.2 s headway allows — about 5.7 per 100 m. A busy road
 * is not a fast road with more cars on it; it is a SLOWER road, and the density
 * follows from the speed. At full load the desired speed is 35% of the limit,
 * which settles at about 9 cars per 100 m and bunches at every signal. */
const LOAD_SLOWS = 0.65;

/** Nobody crawls below this except behind something. */
const MIN_SPEED = 2;

export function createTraffic(state, model, options = {}) {
  const cfg = getConfig();
  const { speed: VMAX, maxDensity, stopLine } = cfg.road;
  const lanes = model.lanes;
  const links = lanes.links;
  const live = options.life !== false;
  const cap = options.cap > 0 ? options.cap : Infinity;

  // A car is five numbers and never an object allocation in the loop.
  const cars = [];
  /** Per link, the cars on it, ordered by distance along. Rebuilt each update
   * rather than maintained: with a few hundred cars a rebuild is cheaper than
   * keeping a sorted structure correct through spawns, despawns and turns. */
  const onLink = new Map();
  /** Per link, the speed its traffic wants to go — a function of the engine's
   * load, recomputed every step because the load changes with the month. */
  const desired = new Map();
  let clock = 0;
  let nextId = 1;

  const blocks = links.filter((l) => l.kind === "block");

  /** The engine's commuter load on the tiles a link covers, 0..1. */
  function loadOf(link) {
    if (link.kind !== "block" || link.tiles.length === 0) return 0;
    let total = 0;
    let count = 0;
    for (const tile of link.tiles) {
      if ((state.tiles.road[tile] & NET_PRESENT) === 0) continue;
      total += state.tiles.traffic[tile];
      count += 1;
    }
    return count === 0 ? 0 : total / count / 255;
  }

  /** How fast traffic wants to go on this link. */
  function speedFor(load) {
    return Math.max(MIN_SPEED, VMAX * (1 - LOAD_SLOWS * load));
  }

  /** How many cars a link should hold. A ceiling rather than a goal: the
   * density that actually happens comes from the speed above. `maxDensity` is
   * cars per 100 m at a full byte, capped by what the road physically holds. */
  function targetFor(link, load) {
    const jam = link.len / (CAR_M + S0);
    return Math.min(jam, (link.len / 100) * maxDensity * load);
  }

  /** Where a car goes at the end of its link: one of the successors, chosen by
   * a hash of the car and the link so a given car turns the same way every
   * time it is asked. */
  function chooseNext(car, link) {
    if (link.next.length === 0) return -1;
    const roll = jitter(car.id * 31 + link.id, 17);
    return link.next[Math.min(link.next.length - 1, Math.floor(roll * link.next.length))].link;
  }

  function bucket() {
    onLink.clear();
    for (const car of cars) {
      const list = onLink.get(car.link);
      if (list) list.push(car);
      else onLink.set(car.link, [car]);
    }
    for (const list of onLink.values()) list.sort((a, b) => a.s - b.s);
  }

  /** Adds a car at the tail of a link if there is a PROPER following gap.
   *
   * Not a token one: admitting a car 6 m behind another at the speed limit made
   * it brake hard, and the slow car it became throttled everything behind it —
   * a permanent plug at the entry that halved the road's throughput and made
   * the load setting irrelevant. It arrives at the speed of the traffic and one
   * headway behind it, or it does not arrive. */
  function spawn(link, v0) {
    if (cars.length >= cap) return false;
    const list = onLink.get(link.id);
    const first = list && list.length > 0 ? list[0] : undefined;
    if (first && first.s < CAR_M + S0 + v0 * HEADWAY) return false;
    const id = nextId;
    nextId += 1;
    const car = {
      id, link: link.id, s: 0, v: first ? Math.min(v0, first.v) : v0,
      variant: jitter(id, 23) > 0.5 ? 1 : 0,
      colour: Math.floor(jitter(id, 29) * 6),
    };
    cars.push(car);
    const existing = onLink.get(link.id);
    if (existing) existing.unshift(car);
    else onLink.set(link.id, [car]);
    return true;
  }

  /** The gap and speed difference to whatever is in front — a car on this link,
   * a car on the link it will join, or a red light at the end of it. */
  function ahead(car, link, list, indexInList) {
    let gap = Infinity;
    let leadV = 0;
    const next = list[indexInList + 1];
    if (next) {
      gap = next.s - car.s - CAR_M;
      leadV = next.v;
      return { gap, leadV, hard: false };
    }

    // Nothing in front on this link. A signal at the end of it is a wall.
    const node = link.kind === "block" ? link.to : -1;
    if (node >= 0 && lanes.signals.has(node) && lanes.phaseAt(node, clock) !== link.axis) {
      return { gap: link.len - car.s, leadV: 0, hard: true };
    }

    // Otherwise look onto the link this car will join, so a queue does not stop
    // dead at every junction it crosses.
    const target = chooseNext(car, link);
    if (target < 0) return { gap: Infinity, leadV: 0, hard: false };
    const beyond = onLink.get(target);
    if (beyond && beyond.length > 0) {
      const lead = beyond[0];
      return { gap: (link.len - car.s) + lead.s - CAR_M, leadV: lead.v, hard: false };
    }
    return { gap: Infinity, leadV: 0, hard: false };
  }

  /** The intelligent-driver model. Returns an acceleration. */
  function accelerate(v, v0, gap, leadV, hard) {
    const free = 1 - (v / v0) ** DELTA;
    if (!Number.isFinite(gap)) return ACCEL * free;
    const brake = hard ? SIGNAL_BRAKE : BRAKE;
    const dv = v - leadV;
    const wanted = S0 + Math.max(0, v * HEADWAY + (v * dv) / (2 * Math.sqrt(ACCEL * brake)));
    const room = Math.max(gap, 0.1);
    return ACCEL * (free - (wanted / room) ** 2);
  }

  function step(dt) {
    bucket();

    // Density control, before anyone moves: one spawn or despawn per link per
    // step, so a road fills over a second or two rather than appearing.
    for (const link of blocks) {
      const list = onLink.get(link.id) ?? [];
      const load = loadOf(link);
      desired.set(link.id, speedFor(load));
      const target = targetFor(link, load);
      if (list.length + 0.5 < target) spawn(link, desired.get(link.id));
      else if (list.length - 0.5 > target && list.length > 0) {
        // The car nearest the end goes, so nothing vanishes under the eye in
        // the middle of a street.
        const going = list[list.length - 1];
        cars.splice(cars.indexOf(going), 1);
        list.pop();
      }
    }

    // Follow, then advance. Two passes so every car sees the same instant.
    for (const [linkId, list] of onLink) {
      const link = links[linkId];
      for (let i = 0; i < list.length; i += 1) {
        const car = list[i];
        const { gap, leadV, hard } = ahead(car, link, list, i);
        // A car in a junction keeps the speed of the road it came from.
        const v0 = desired.get(link.kind === "block" ? link.id : link.from) ?? VMAX;
        const a = accelerate(car.v, v0, gap, leadV, hard);
        car.v = Math.max(0, Math.min(VMAX, car.v + a * dt));
        // Never move further than the gap: the model is stable at these
        // constants but a fixed step is not a proof, and two cars in the same
        // place is the one artefact a viewer notices instantly.
        car.pending = Math.min(car.v * dt, Math.max(0, gap));
      }
    }

    const leaving = [];
    for (const car of cars) {
      const link = links[car.link];
      car.s += car.pending ?? 0;
      car.pending = 0;
      if (car.s < link.len) continue;
      const target = chooseNext(car, link);
      if (target < 0) { leaving.push(car); continue; }
      car.s -= link.len;
      car.link = target;
      const beyond = links[target];
      if (car.s > beyond.len) car.s = beyond.len;
    }
    for (const car of leaving) cars.splice(cars.indexOf(car), 1);

    clock += dt;
  }

  // A frozen road still has cars on it (`?life=0` is for screenshots, and an
  // empty street is not the picture anyone wants to check). Settle first, then
  // stop the clock.
  const settleSteps = live ? 0 : 240;
  for (let i = 0; i < settleSteps; i += 1) step(1 / 30);
  if (!live) bucket();

  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };

  return {
    /** One frame. Nothing happens when life is off. */
    update(dt) {
      if (!live || !(dt > 0)) return;
      // A tab that was in the background hands back a delta of several seconds,
      // and a car that advances four hundred metres in one step drives through
      // everything in front of it. Clamp rather than sub-step: the picture
      // catching up gradually is better than a frame that costs a second.
      step(Math.min(dt, 1 / 15));
    },

    /** Writes every car into the instanced pools, in TILE units — the pools are
     * still in tiles until V5 moves the camera to metres. */
    pose(pools, push, colours) {
      const tileM = model.tileM;
      for (const car of cars) {
        const link = links[car.link];
        if (!link) continue;
        lanes.sample(link, car.s, out);
        const pool = pools[`car${car.variant}`];
        if (!pool) continue;
        // Local +x runs along the car; rotating by θ about Y sends it to
        // (cos θ, −sin θ) in world x, z.
        push(pool, out.x / tileM, out.y / tileM, out.z / tileM, 1, 1, 1,
          colours[car.colour % colours.length], Math.atan2(-out.tz, out.tx));
      }
      return cars.length;
    },

    count: () => cars.length,
    clock: () => clock,
    cars: () => cars.slice(),

    /** Every pair of cars that share a link, in order — the following model's
     * own invariant, exposed so a test can hold it to it. */
    pairsOnSameLink() {
      bucket();
      const pairs = [];
      for (const list of onLink.values()) {
        for (let i = 0; i + 1 < list.length; i += 1) pairs.push([list[i], list[i + 1]]);
      }
      return pairs;
    },
  };
}

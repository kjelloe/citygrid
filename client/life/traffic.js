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
import { rushScale, tideAt } from "../world/rush.js";
import { doorPoint } from "../world/street-furniture.js";
import { frontEdgeOf, OUTWARD } from "../world/lots.js";
import { closestAlong } from "../world/polyline.js";
import { NET_PRESENT } from "../constants-mirror.js";

/** A car, in metres. The mesh is 0.22 tiles long and a tile is 20 m. */
/** The longest step the simulation will take, whatever delta it is handed.
 *
 * Exported because it is the difference between simulated time and wall-clock
 * time, and a test comparing two frame rates has to know which one it is
 * measuring (D7). */
export const MAX_STEP = 1 / 15;

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

/** Bumper height, metres, and the two colours (V8). Warm white forward, red
 * back — the only pair of colours a driver behind you can read at a glance. */
const LAMP_Y = 0.55;
const HEAD_COLOUR = 0xfff2d0;
const TAIL_COLOUR = 0xff4433;

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
  /** Where the day is, 0..1 — the same number the light rig buckets into
   * presets. The caller hands it in, the way it hands in the delta: this
   * module has no clock of its own (ruling 037). */
  // The hour the road keeps (B4). Set at construction as well as through
  // `setPhase`, because a frozen shot (`?life=0`) settles its cars ONCE, before
  // the first frame has told anybody what time it is — so an `hour=` screenshot
  // would otherwise show an ordinary day's population under a night sky.
  let phase = options.phase;

  const blocks = links.filter((l) => l.kind === "block");

  /** How fast a road fills or empties, in cars per second per link (D7).
   *
   * Ten, which is what the old per-frame rule came to at 10 fps — and `update`
   * clamps its delta to 1/15 s, so this never spends more than one car in a
   * step and the behaviour at any playable frame rate is the behaviour that was
   * there before. What actually governs the fill is `spawn`'s following gap:
   * at the speed limit a link admits about one car every two seconds however
   * often it is asked. */
  const FILL_PER_SECOND = 10;

  /** How far a lot's door may be from a lane and still open onto it, metres.
   * The door is on the pavement (`doorPoint`), the near lane about five metres
   * in from it; twelve takes the far lane's centre line too, and no further. */
  const DOOR_REACH = 12;

  /** How fast a car pulls out of a driveway, as a share of the street's speed.
   * It enters slower than the traffic, which is what makes it read as coming
   * OUT of something — and only with twice a headway behind it, so the car it
   * pulls out in front of eases off rather than stopping (see `spawn`). */
  const PULL_OUT = 0.5;

  /** Fractional cars owed to each link, so a rate per second survives being
   * asked in sixtieths. Renderer-local memory, which is what `client/life/` is
   * for (ruling 037). */
  const fillCredit = new Map();

  /** How much time this simulation has actually lived through, in seconds.
   *
   * Not wall-clock: `update` clamps its delta, so a machine below 15 fps
   * advances the city more slowly than the clock on the wall (Q78). Two
   * measurements of "the same city" are only the same city if they have lived
   * the same length of time, and until this was reported there was no way to
   * tell — the perf card compared a row that had lived 12 seconds with one that
   * had lived 3 and called the difference a frame-rate defect (D7). */
  let elapsed = 0;
  /** The block links of each corridor, indexed once (R4).
   *
   * `placeYield` walked every block link in the city for every yield point,
   * every step — yields × ~6,000 links on a 128×128 — for a lookup the
   * derivation already knew the answer to. Two links a corridor, and
   * `nearestCorridor` has already said which corridor. */
  /** Block links by the node they arrive at, and whether each gives way there
   * — the give-way check asks both every step (T1). */
  const arrivingAt = new Map();
  const blocksByCorridor = new Map();
  for (const link of blocks) {
    const list = blocksByCorridor.get(link.corridor);
    if (list) list.push(link); else blocksByCorridor.set(link.corridor, [link]);
    link.givesWay = lanes.givesWay(link);
    const at = arrivingAt.get(link.to);
    if (at) at.push(link); else arrivingAt.set(link.to, [link]);
  }

  /** Where cars have to stop, per link: `s` along the link, ascending.
   *
   * Rebuilt from world points once a step rather than kept: the people move
   * every frame, and a yield that outlives the person who caused it is a
   * permanent roadblock that looks exactly like a jam (E7, A45). */
  const yieldsOn = new Map();
  /** The world points, as handed in. */
  let yieldPoints = [];

  /** Turns a world point into `(link, s)` on whatever carriageway it is
   * standing in.
   *
   * Through `model.nearestCorridor`, which is already a spatial query, so the
   * cost is a lookup and two projections rather than a scan of every link.
   * A point that is not on a carriageway at all yields to nobody: somebody on
   * the pavement is not in anyone's road. */
  function placeYield(point) {
    const near = model.nearestCorridor(point.x, point.z, cfg.road.width / 2);
    if (!near || !near.corridor) return;
    for (const link of blocksByCorridor.get(near.corridor.id) ?? []) {
      // `s0` and `dirSign` are the link's own frame on its corridor, recorded
      // when the graph was derived — the alternative is a search back through
      // the polyline for a number the derivation already knew.
      const s = (near.s - link.s0) * link.dirSign;
      if (s < 0 || s > link.len) continue;
      const list = yieldsOn.get(link.id);
      if (list) list.push(s); else yieldsOn.set(link.id, [s]);
    }
  }

  function rebuildYields() {
    yieldsOn.clear();
    for (const point of yieldPoints) placeYield(point);
    for (const list of yieldsOn.values()) list.sort((a, b) => a - b);
  }

  /** The nearest thing on this link a car at `s` has to stop for. */
  function yieldAhead(linkId, s) {
    const list = yieldsOn.get(linkId);
    if (!list) return Infinity;
    for (const at of list) if (at > s) return at;
    return Infinity;
  }

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
    // The HOUR multiplies the street's own load (B4): 0.4 at night, 1.3 at the
    // two rushes. The engine says how busy a street is; the clock says how busy
    // the hour is, and a city with no difference between the two is a city with
    // no day in it. `jam` still caps it — a rush cannot put more cars on a road
    // than physically fit.
    const hour = rushScale(phase);
    // Doors change WHERE a car appears, never how many (B4: "the density
    // control keeps the equilibrium"). A first version boosted any link with
    // frontage by 1.35 and the ordinary-day city went from 295 cars to 412,
    // with the junction pile-ups that came with them.
    return Math.min(jam, (link.len / 100) * maxDensity * load * hour);
  }

  /** Where on each block link a car comes out of a building and goes back into
   * one (B4): "a car appears out of a driveway or a bay and leaves into one,
   * rather than materialising mid-link".
   *
   * A lot's door is the pavement end of E5's path — the same `doorPoint` the
   * pedestrians use (`nav.js`) — seated on the nearest lane within reach. Not
   * within a car and a gap of either end of the link: a driveway in the mouth
   * of a junction is a car appearing in the junction. Sorted by `s`.
   *
   * Candidates come from the tiles the door is beside, not from every link in
   * the city: this is rebuilt on every build action, and a scan of all of
   * them per lot was a third of a second on the 96-tile city. */
  const doorsOn = (() => {
    const byTile = new Map();
    for (const link of blocks) {
      for (const tile of link.tiles) {
        const list = byTile.get(tile);
        if (list) list.push(link);
        else byTile.set(tile, [link]);
      }
    }
    const margin = CAR_M + S0;
    const byLink = new Map();
    for (const lot of model.lots) {
      if (lot.facing === false) continue;
      const point = doorPoint(frontEdgeOf(lot), OUTWARD[lot.frontage]);
      const tx = Math.floor(point.x / cfg.tileM);
      const ty = Math.floor(point.z / cfg.tileM);
      let best;
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = tx + dx;
        const y = ty + dy;
        if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
        for (const link of byTile.get(y * state.width + x) ?? []) {
          if (link.len < 2 * margin) continue;
          const hit = closestAlong(link, point.x, point.z);
          if (hit.dist <= DOOR_REACH && (!best || hit.dist < best.dist)) best = { link, hit };
        }
      }
      if (!best) continue;
      const at = Math.max(margin, Math.min(best.link.len - margin, best.hit.s));
      const list = byLink.get(best.link.id);
      const door = { s: at, home: lot.building.zone === 1, lot: lot.id };
      if (list) list.push(door);
      else byLink.set(best.link.id, [door]);
    }
    for (const list of byLink.values()) list.sort((a, b) => a.s - b.s);
    return byLink;
  })();

  /** The doors on a link that are sending cars OUT at this hour, or all of
   * them when the hour has no tide: homes in the morning, shops and works in
   * the evening (B4).
   *
   * Possibly none, and then the car comes round the corner instead (`spawn`
   * falls back to the link's tail). A fallback to "any door" read well and was
   * wrong: each door sits on its own side's lane, so most links carry only
   * homes or only shops, and on those the fallback let the homes emit all
   * evening — 24 cars from homes against 20 from shops at the evening rush. */
  function emitting(doors) {
    const tide = tideAt(phase);
    if (tide === "none") return doors;
    return doors.filter((d) => d.home === (tide === "out"));
  }

  /** And the ones RECEIVING: the other half of the same tide. */
  function receiving(doors) {
    const tide = tideAt(phase);
    if (tide === "none") return doors;
    return doors.filter((d) => d.home === (tide === "in"));
  }

  /** Where a car goes at the end of its link: one of the successors, chosen by
   * a hash of the car and the link so a given car turns the same way every
   * time it is asked. */
  function chooseNext(car, link) {
    if (link.next.length === 0) return -1;
    const roll = jitter(car.id * 31 + link.id, 17);
    return link.next[Math.min(link.next.length - 1, Math.floor(roll * link.next.length))].link;
  }

  /** Is this car about to leave its link by anything but the straight ahead?
   *
   * The turn is already chosen — `chooseNext` is a hash of the car and the
   * link, so a car turns the same way every time it is asked — and this only
   * asks whether the answer is the FIRST successor, which is the one a lane
   * continues into. Within twenty metres of the end, which is about when a
   * driver would signal.
   */
  function turningSoon(car, link) {
    // A car turning in at a door signals for it too.
    if (car.exitAt !== undefined) return car.exitAt - car.s <= 20;
    if (link.next.length < 2) return false;
    if (link.len - car.s > 20) return false;
    return chooseNext(car, link) !== link.next[0].link;
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

  /** Adds a car at one of the link's doors or, failing that, at its tail — if
   * there is a PROPER gap.
   *
   * Not a token one: admitting a car 6 m behind another at the speed limit made
   * it brake hard, and the slow car it became throttled everything behind it —
   * a permanent plug at the entry that halved the road's throughput and made
   * the load setting irrelevant. At the tail it arrives at the speed of the
   * traffic and one headway behind it, or it does not arrive.
   *
   * At a door (B4) it pulls out slower than the traffic, so it needs room on
   * BOTH sides: a headway to the car in front at its own speed, and two of the
   * following car's headways behind it, so that car eases off rather than
   * stops. Which door is a hash of the car, so the same city spawns the same
   * way on two clients (ruling 032). */
  function spawn(link, v0) {
    if (cars.length >= cap) return false;
    const list = onLink.get(link.id) ?? [];
    const at = doorSlot(link, list, v0) ?? tailSlot(list, v0);
    if (!at) return false;
    const id = nextId;
    nextId += 1;
    const car = {
      id, link: link.id, s: at.s, v: at.v, v0,
      variant: jitter(id, 23) > 0.5 ? 1 : 0,
      colour: Math.floor(jitter(id, 29) * 6),
    };
    cars.push(car);
    list.splice(at.index, 0, car);
    if (!onLink.has(link.id)) onLink.set(link.id, list);
    return true;
  }

  function tailSlot(list, v0) {
    const first = list[0];
    if (first && first.s < CAR_M + S0 + v0 * HEADWAY) return undefined;
    return { s: 0, v: first ? Math.min(v0, first.v) : v0, index: 0 };
  }

  function doorSlot(link, list, v0) {
    const doors = doorsOn.get(link.id);
    if (!doors) return undefined;
    const open = emitting(doors);
    if (open.length === 0) return undefined;
    const door = open[Math.floor(jitter(nextId * 7 + link.id, 41) * open.length) % open.length];
    let index = 0;
    while (index < list.length && list[index].s < door.s) index += 1;
    const ahead = list[index];
    const behind = list[index - 1];
    const v = Math.max(MIN_SPEED, Math.min(v0 * PULL_OUT, ahead ? ahead.v : v0));
    if (ahead && ahead.s - door.s - CAR_M < S0 + v * HEADWAY) return undefined;
    if (behind && door.s - behind.s - CAR_M < S0 + 2 * behind.v * HEADWAY) return undefined;
    return { s: door.s, v, index };
  }

  /** Picks a car on this link to turn in at a door ahead of it, rather than
   * deleting one (B4: "and leaves into one"). The nearest such turn that is
   * still eight metres off, so there is time to see the indicator. Returns
   * false when nobody on the link has a door ahead of them. */
  function sendHome(link, list) {
    const doors = doorsOn.get(link.id);
    if (!doors) return false;
    const open = receiving(doors);
    let best;
    for (const car of list) {
      if (car.exitAt !== undefined) continue;
      for (const door of open) {
        const d = door.s - car.s;
        if (d < 8) continue;
        if (!best || d < best.d) best = { car, d, s: door.s };
        break;
      }
    }
    if (!best) return false;
    best.car.exitAt = best.s;
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

    // Somebody in the road is a wall, and a harder one than a red light:
    // A45 gives a person right of way and a car that merely slows for one has
    // not yielded. Checked before the signal because it is nearer.
    const person = yieldAhead(link.id, car.s);
    if (Number.isFinite(person)) {
      return { gap: Math.max(0, person - car.s - S0), leadV: 0, hard: true };
    }

    // Nothing in front on this link. A signal at the end of it is a wall.
    const node = link.kind === "block" ? link.to : -1;
    if (node >= 0 && lanes.signals.has(node) && lanes.phaseAt(node, clock) !== link.axis) {
      return { gap: link.len - car.s, leadV: 0, hard: true };
    }
    // And so is a junction this arm gives way at (T1, A51). Since only a
    // crossing of two real streets is signalled, most junctions on an ordinary
    // grid are give-way, and something has to hold priority or the cars drive
    // through each other at every one of them. The minor arm waits until
    // nothing on the through road is within `GIVE_WAY_SECONDS` of the box; the
    // through road never stops.
    if (node >= 0 && lanes.givesWay(link) && !gapAt(node, link)) {
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

  /** How long a gap the minor arm needs on the through road, in seconds. */
  const GIVE_WAY_SECONDS = 2;

  /**
   * Is the through road clear enough to pull out at `node`?
   *
   * Every car on a link that ARRIVES at the node and does not give way, within
   * `road.speed × GIVE_WAY_SECONDS` of the end of its own link. Cheap because
   * the arriving links are indexed once: a node has three or four of them.
   */
  function gapAt(node, mine) {
    const reach = VMAX * GIVE_WAY_SECONDS;
    for (const link of arrivingAt.get(node) ?? []) {
      if (link.id === mine.id || link.givesWay) continue;
      for (const other of onLink.get(link.id) ?? []) {
        if (link.len - other.s <= reach) return false;
      }
    }
    return true;
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

  /** Is a link's first tile inside the visible box? A link is at most one
   * corridor long, so its first tile is close enough to decide by — and the
   * bounds already carry a margin for exactly this kind of approximation. */
  function onScreen(link, bounds) {
    if (!bounds) return true;
    const tile = link.tiles?.[0];
    if (tile === undefined) return true;
    const x = tile % state.width;
    const y = (tile - x) / state.width;
    return x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1;
  }

  function step(dt) {
    elapsed += dt;
    bucket();
    rebuildYields();

    // Density control, before anyone moves. **Per second, not per step.**
    //
    // This was one spawn or despawn per link per FRAME, so how full a city is
    // was a function of how many frames had elapsed rather than of how long:
    // Kjell's 4090 reached 4,590 cars on the saturated fixture in the same
    // warm-up where SwiftShader reached 1,546, and the triangle counts moved
    // with them — two machines measuring two different cities (Q76, D7).
    //
    // A per-link credit in cars, spent as it accumulates. The equilibrium was
    // never set by this rate anyway: `targetFor` sets it, and `spawn` refuses
    // without a proper following gap, so the rate only decides how quickly a
    // road fills. It is capped at one so a link that cannot admit anybody —
    // the cap is spent, or the tail is blocked — does not bank credit and then
    // empty a queue of cars onto the road the moment it can.
    for (const link of blocks) {
      const list = onLink.get(link.id) ?? [];
      const load = loadOf(link);
      desired.set(link.id, speedFor(load));
      const target = targetFor(link, load);
      let credit = (fillCredit.get(link.id) ?? 0) + FILL_PER_SECOND * dt;
      while (credit >= 1) {
        credit -= 1;
        // A car already turning in for a door is gone as far as the count is
        // concerned; it just has not arrived yet.
        const staying = list.length - list.filter((c) => c.exitAt !== undefined).length;
        if (staying + 0.5 < target) {
          if (!spawn(link, desired.get(link.id))) break;
        } else if (staying - 0.5 > target && staying > 0) {
          if (sendHome(link, list)) continue;
          // Nobody has a door ahead: the car nearest the end goes, so nothing
          // vanishes under the eye in the middle of a street.
          const going = list[list.length - 1];
          cars.splice(cars.indexOf(going), 1);
          list.pop();
        } else break;
      }
      fillCredit.set(link.id, Math.min(credit, 1));
    }

    // Follow, then advance. Two passes so every car sees the same instant.
    for (const [linkId, list] of onLink) {
      const link = links[linkId];
      for (let i = 0; i < list.length; i += 1) {
        const car = list[i];
        const { gap, leadV, hard } = ahead(car, link, list, i);
        // A car in a junction keeps the speed of the road it came FROM, which
        // it carries. `link.from` on a turn link is a NODE id and `desired` is
        // keyed by LINK ids, so the old lookup returned a stranger's speed —
        // usually an empty road's, so a car crossing a busy junction sped up
        // inside the box and braked on the far side (R1.3).
        // Kept ON THE CAR, so it survives the junction and so a test can read
        // it: a block's desired speed comes from its own load, and a turn has
        // no load of its own, so it keeps whatever the approach was doing.
        car.v0 = link.kind === "block"
          ? (desired.get(link.id) ?? VMAX)
          : (car.v0 ?? VMAX);
        const v0 = car.v0;
        const a = accelerate(car.v, v0, gap, leadV, hard);
        // What the car is DOING, for its lamps (B4). No state and no hash.
        // Two ways to have your brakes on, and the second is the one a viewer
        // actually sees: a queue at a red light is a line of red lamps, and
        // measured on a four-junction city only 2.5% of cars are decelerating
        // at any instant while 13% are stopped or crawling.
        car.brake = a < -0.8 || (car.v < 1.5 && v0 > 2);
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
      // Turned in at its door (B4).
      if (car.exitAt !== undefined && car.s >= car.exitAt) { leaving.push(car); continue; }
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
    /**
     * Who the cars have to stop for this frame, as world points (A45).
     *
     * People on crossings and, in street mode, the player's own walker. Cars
     * yield and the walker goes anywhere: the collision world deliberately
     * never keeps a person off a carriageway, so the carriageway keeps itself
     * off them.
     */
    yieldTo(points, walker) {
      yieldPoints = walker ? [...points, walker] : points;
    },

    /** Where the day is, 0..1 (B4). Handed in by the caller with the same
     * clock the light rig uses, so the hour a player sees and the hour the
     * traffic keeps are one hour. */
    setPhase(at) {
      phase = at;
    },

    /** Each block link's doors, by link id: `{ s, home, lot }`, sorted by `s`. */
    doors() {
      return doorsOn;
    },

    /** One frame. Nothing happens when life is off. */
    update(dt) {
      if (!live || !(dt > 0)) return;
      // A tab that was in the background hands back a delta of several seconds,
      // and a car that advances four hundred metres in one step drives through
      // everything in front of it. Clamp rather than sub-step: the picture
      // catching up gradually is better than a frame that costs a second.
      step(Math.min(dt, MAX_STEP));
    },

    /** Writes every car into the instanced pools, in TILE units — the pools are
     * still in tiles until V5 moves the camera to metres. */
    pose(pools, push, colours, bounds) {
      const tileM = model.tileM;
      let posed = 0;
      const brakePool = pools.carBrake;
      const turnPool = pools.carTurn;
      // An indicator that does not blink reads as a fault light. 1.5 Hz, off
      // the traffic clock, so it stops with everything else when life is off.
      //
      // And when life is off it is always ON. A frozen city settles for 240
      // steps of 1/30 and that sum lands at 7.999999999999981, two parts in
      // 10^14 short of eight — which put the blink in its dark half and left
      // it there, so every screenshot of a frozen city came back with 153 cars
      // about to turn and not one indicator lit. A frozen frame cannot wait
      // for the next blink.
      const blink = !live || Math.floor(clock * 3) % 2 === 0;
      for (const car of cars) {
        const link = links[car.link];
        if (!link) continue;
        if (!onScreen(link, bounds)) continue;
        lanes.sample(link, car.s, out);
        const pool = pools[`car${car.variant}`];
        if (!pool) continue;
        // Local +x runs along the car; rotating by θ about Y sends it to
        // (cos θ, −sin θ) in world x, z.
        const rotation = Math.atan2(-out.tz, out.tx);
        push(pool, out.x / tileM, out.y / tileM, out.z / tileM, 1, 1, 1,
          colours[car.colour % colours.length], rotation);
        // The lamps, only for the cars showing them. A car near the end of its
        // link that has chosen a turn indicates; one that is slowing brakes.
        if (brakePool && car.brake) {
          push(brakePool, out.x / tileM, out.y / tileM, out.z / tileM, 1, 1, 1, 0xd83a2a, rotation);
        }
        if (turnPool && blink && turningSoon(car, link)) {
          push(turnPool, out.x / tileM, out.y / tileM, out.z / tileM, 1, 1, 1, 0xe8a33a, rotation);
        }
        posed += 1;
      }
      return posed;
    },

    /**
     * Where a car's two lamps are, in world metres (V8, spec §9.1).
     *
     * Half a car length either side of the middle, at bumper height. Exposed
     * as well as posed, because "the headlights are on the front" is not
     * something a screenshot argues about — a car with them behind it reads as
     * traffic going the wrong way down the street, and only at a distance.
     */
    lampsOf(car) {
      const link = links[car.link];
      if (!link) return [];
      lanes.sample(link, car.s, out);
      const half = CAR_M / 2 - 0.3;
      return [
        { kind: "head", x: out.x + out.tx * half, y: out.y + LAMP_Y, z: out.z + out.tz * half },
        { kind: "tail", x: out.x - out.tx * half, y: out.y + LAMP_Y, z: out.z - out.tz * half },
      ];
    },

    /**
     * Writes the lamps into their pools, dialled by `night`.
     *
     * Nothing at all by day: two extra instances a car is cheap and a city of
     * cars with their headlights on at noon is the thing everybody notices.
     */
    poseLights(pools, push, night, bounds) {
      if (!(night > 0.05)) return 0;
      const tileM = model.tileM;
      let posed = 0;
      for (const car of cars) {
        const link = links[car.link];
        if (!link || !onScreen(link, bounds)) continue;
        for (const lamp of this.lampsOf(car)) {
          const pool = pools[lamp.kind === "head" ? "headlight" : "taillight"];
          if (!pool) continue;
          push(pool, lamp.x / tileM, lamp.y / tileM, lamp.z / tileM, 1, 1, 1,
            lamp.kind === "head" ? HEAD_COLOUR : TAIL_COLOUR,
            Math.atan2(-out.tz, out.tx));
          posed += 1;
        }
      }
      return posed;
    },

    /**
     * Is a car about to come through this junction on that corridor? (T1.)
     *
     * What a pedestrian at an UNSIGNALLED crossing asks before stepping out —
     * the same `GIVE_WAY_SECONDS` a car on a minor arm waits for, so the person
     * and the car agree about what a gap is.
     */
    busyAt(corridor, node) {
      const reach = VMAX * GIVE_WAY_SECONDS;
      for (const link of blocksByCorridor.get(corridor) ?? []) {
        // **The end the question is about.** A corridor has a block link in
        // each direction and a crossing at each end, and `link.len - car.s` is
        // the distance to the end THIS link runs to. Without the filter a car
        // arriving at the far junction — one that has already gone through this
        // crossing and is leaving — held the person on this kerb, which on a
        // grid is every crossing in the city answering for its twin (M5).
        if (link.to !== node) continue;
        for (const car of onLink.get(link.id) ?? []) {
          if (link.len - car.s <= reach) return true;
        }
      }
      return false;
    },

    /** How many cars are on screen. The same set `pose` writes, or the budget
     * is charged for cars nobody draws: on a saturated 128x128 that was 3,660
     * cars at 82 triangles against a 200k budget, so the ladder dropped the
     * cars at every zoom and the pools carried the cost anyway (R1.1). */
    count(bounds) {
      if (!bounds) return cars.length;
      let n = 0;
      for (const car of cars) {
        const link = links[car.link];
        if (link && onScreen(link, bounds)) n += 1;
      }
      return n;
    },
    clock: () => clock,
    cars: () => cars.slice(),

    /** Seconds of simulated time, which is what a car count is a function of. */
    simulatedS: () => elapsed,

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

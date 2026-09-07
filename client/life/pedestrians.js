// People on the pavement (slice E7; spec §9.3, ruling 037).
//
// The pedestrian half of what `traffic.js` does for cars, and deliberately the
// same shape: **nothing here is state**. No person, no position, no float
// enters the reducer. A crowd is a local simulation over a derived graph, and
// two clients showing the same city show the same crowd without agreeing on
// anything, because every choice a person makes is a hash of an integer that is
// already in state (rulings 032, 037).
//
// What the engine decides is how many people a building HOLDS; this decides
// what that looks like on the pavement outside it. `nav.js` turns occupancy
// into a demand per pavement; this fills the pavement to it.
//
// Renderer-local, so it is allowed to remember where everybody is between
// frames — and it takes its time as a delta from the caller, which is what
// makes `?life=0` freeze it.

import { jitter } from "../world/hash.js";
import { getConfig } from "../world/config.js";

/** How near a person may come to the person in front before slowing.
 * A queue on a pavement, not a collision system: people are soft. */
const LOOK = 3;

/** How long a person walks before they are done and go back indoors, in
 * metres. Long enough to cross a couple of junctions, short enough that the
 * crowd is always turning over rather than being the same twelve people. */
const JOURNEY = 220;

export function createPedestrians(state, model, nav, options = {}) {
  const cfg = getConfig();
  const { pace, paceVary, bob, stride, spacing, crossWait } = cfg.ped;
  const live = options.life !== false;
  const cap = options.cap === undefined ? Infinity : options.cap;

  const people = [];
  /** Per edge, who is on it, ordered along — rebuilt each step, like the cars'
   * buckets: with a couple of hundred people a rebuild is cheaper than keeping
   * a sorted structure correct through spawns, turns and despawns. */
  const onEdge = new Map();
  let clock = 0;
  let nextId = 1;
  let waited = 0;
  let crossed = 0;
  /** "Is a car about to come through this crossing?", answered by the caller.
   * Optional: with nothing wired up an unsignalled crossing is simply open, so
   * a gate that does not build traffic gets a crowd rather than a queue frozen
   * on the kerb (T1). */
  let busyOn;

  const walks = nav.edges.filter((e) => e.kind === "walk" && e.demand > 0);
  /** The pavements the camera can see, and the box they were chosen for.
   *
   * The cap is a budget and a budget spent off screen is a budget wasted: on a
   * 96×96 the first 120 pavements in edge order are wherever the derivation
   * happened to start, and the street under the player had nobody on it. The
   * same reasoning as A39's "bake the chunks that are ON SCREEN first". */
  let inView = walks;
  let inViewKey = "";

  /** How many people this pavement holds, as a whole number.
   *
   * The fraction is resolved by a HASH of the edge rather than rounded away.
   * Rounded — the cars' rule, `here + 0.5 < target`, copied over — a pavement
   * outside an ordinary house asks for 0.24 people and gets none, so a city of
   * houses had nobody on it at all while the unit fixture (occupancy 120, so
   * 1.44) was full. Hashed, a quarter of those pavements have somebody on them
   * and the city reads as busy in proportion to what it holds — and it is still
   * a function of the state, so two clients see the same crowd (ruling 037).
   */
  function holdsOn(edge) {
    const whole = Math.floor(edge.demand);
    return whole + (jitter(edge.id, 73) < edge.demand - whole ? 1 : 0);
  }

  function bucket() {
    onEdge.clear();
    for (const p of people) {
      const list = onEdge.get(p.edge);
      if (list) list.push(p);
      else onEdge.set(p.edge, [p]);
    }
    for (const list of onEdge.values()) list.sort((a, b) => a.s - b.s);
  }

  /** Which of an edge's doors is nearest the camera, and how far away it is.
   *
   * A pavement is a whole street — three hundred metres of it — so "the nearest
   * pavement" is not the same question as "the nearest doorway", and the first
   * version answered the wrong one: the edge under the camera was picked first
   * and then somebody was put out of a door at the far end of it. 69 of 120
   * people stood more than 250 m away on the street the player was standing in.
   */
  function nearestDoor(edge, focus) {
    let best;
    for (const id of edge.doors) {
      const door = nav.doors[id];
      if (!focus) { best = { door, d: 0 }; break; }
      const d = Math.hypot(door.x / model.tileM - focus.x, door.z / model.tileM - focus.z);
      if (!best || d < best.d) best = { door, d };
    }
    return best;
  }

  /** Somebody comes out of a door. `dir` is which way along the pavement they
   * set off, hashed so the same person always leaves the same way. */
  function spawn(edge, focus) {
    if (people.length >= cap) return false;
    const door = focus
      ? nearestDoor(edge, focus)?.door
      : nav.doors[edge.doors[Math.floor(jitter(nextId, 41) * edge.doors.length) % edge.doors.length]];
    if (!door) return false;
    const id = nextId;
    nextId += 1;
    const person = {
      id,
      edge: edge.id,
      s: door.s,
      dir: jitter(id, 43) > 0.5 ? 1 : -1,
      v: 0,
      // Everybody walks at a slightly different speed, or a pavement is a
      // conveyor belt: the whole crowd moves as one block and it reads as one
      // object rather than as people.
      pace: pace * (1 - paceVary / 2 + jitter(id, 47) * paceVary),
      phase: jitter(id, 53) * Math.PI * 2,
      left: JOURNEY * (0.6 + jitter(id, 59) * 0.8),
      variant: jitter(id, 61) > 0.5 ? 1 : 0,
      colour: Math.floor(jitter(id, 67) * 6),
      waiting: 0,
    };
    people.push(person);
    return true;
  }

  /** How much room the person in front leaves, in metres — `Infinity` when
   * there is nobody in front on this edge. */
  function roomAhead(person, list, index) {
    for (let i = index + person.dir; i >= 0 && i < list.length; i += person.dir) {
      const other = list[i];
      if (other.dir !== person.dir) continue;   // somebody walking the other way passes
      const gap = (other.s - person.s) * person.dir;
      if (gap <= 0) continue;
      return gap;
    }
    return Infinity;
  }

  /** May somebody step onto `edge` right now? Only crossings can refuse, and
   * only when the light is sending cars across them.
   *
   * The axis is the arm the crossing sits on: when the signal gives that axis
   * green, the cars ON it are moving, and that is exactly when a person must
   * not be in front of them. Amber counts as against, both ways. */
  function open(edge) {
    if (edge.kind !== "cross" || edge.node === undefined) return true;
    // No axis means no light (T1, A51): since only a crossing of two real
    // streets is signalled, most crossings are give-way. A person there waits
    // for a GAP — which the caller answers, because the cars are in
    // `life/traffic.js` and this module may not reach into them — and one
    // holding for a phase that never changes would wait for ever.
    if (edge.axis === undefined) return !busyOn?.(edge.corridor, edge.node);
    return model.lanes.phaseAt(edge.node, clock) !== edge.axis;
  }

  /** Where a person goes at the end of an edge: one of the ways on from that
   * end, chosen by a hash of the person and the edge, so a given person turns
   * the same way every time they are asked — the cars' rule (V1). */
  function chooseNext(person, edge) {
    const options_ = nav.next(edge, person.dir);
    if (options_.length === 0) return -1;
    const roll = jitter(person.id * 31 + edge.id, 71);
    return options_[Math.min(options_.length - 1, Math.floor(roll * options_.length))];
  }

  /** Which way along the new edge a person is walking, given the node they
   * came in through. */
  function directionOn(edge, at) {
    return edge.from === at ? 1 : -1;
  }

  function step(dt, bounds, focus) {
    if (bounds) {
      // Quantised to whole tiles: the box moves every frame under a moving
      // camera and re-sorting four thousand pavements sixty times a second is
      // the kind of cost that does not show up in a triangle budget.
      const key = `${bounds.x0 | 0}|${bounds.x1 | 0}|${bounds.y0 | 0}|${bounds.y1 | 0}|${(focus?.x ?? 0) | 0}|${(focus?.z ?? 0) | 0}`;
      if (key !== inViewKey) {
        inViewKey = key;
        // Nearest to the EYE, not to the middle of the visible box (A39's
        // lesson, one lane along). Under perspective at a low pitch the box
        // stretches to the horizon and its centre is a hundred metres in front
        // of the camera — ordering by it put the nearest of a hundred and
        // twenty people 137 m away with an empty pavement underfoot.
        const cx = focus?.x ?? (bounds.x0 + bounds.x1) / 2;
        const cz = focus?.z ?? (bounds.y0 + bounds.y1) / 2;
        const centre = { x: cx, z: cz };
        // NEAREST first, not merely inside the box. Filtered alone, the cap was
        // spent on whichever pavements the derivation happened to list first —
        // on the shoot fixture the nearest of a hundred and twenty people was
        // eighty-four metres away and the street the camera stood in was empty.
        const near = walks.filter((e) => onScreen(e, bounds));
        // By the nearest DOORWAY on the pavement, not by where the pavement
        // starts: a corridor is three hundred metres long and its first point
        // says nothing about where the people on it will be.
        const at = (e) => nearestDoor(e, centre)?.d ?? Infinity;
        inView = (near.length > 0 ? near : walks).slice().sort((a, b) => at(a) - at(b));
      }
    } else {
      inView = walks;
      inViewKey = "";
    }
    bucket();

    const leaving = [];
    // Anybody the camera cannot see gives their place back. A person walking
    // an empty pavement two hundred metres behind the player is a slot the cap
    // could be spending on the street they are standing in, and nobody can
    // tell the difference — the street cache lets a chunk go for exactly the
    // same reason.
    if (bounds) {
      for (const person of people) {
        if (!onScreen(nav.edges[person.edge], bounds)) leaving.push(person);
      }
      for (const person of leaving) people.splice(people.indexOf(person), 1);
      leaving.length = 0;
      bucket();
    }

    // Fill the pavements towards what their buildings ask for, NEAREST FIRST
    // and each one to its own capacity before moving on.
    //
    // One arrival per pavement per step — the cars' rule — filled the hundred
    // and twenty nearest PAVEMENTS with one person each, and on a 64-tile map
    // that is the whole city: 39 of 120 people stood more than 250 m from the
    // camera and the street underfoot had two. The cap is a budget, and it is
    // spent where it can be seen (the same reasoning as A39).
    for (const edge of inView) {
      if (people.length >= cap) break;
      let here = (onEdge.get(edge.id) ?? []).length;
      const wants = holdsOn(edge);
      while (here < wants && people.length < cap && spawn(edge, focus)) here += 1;
    }

    for (const [edgeId, list] of onEdge) {
      const edge = nav.edges[edgeId];
      for (let i = 0; i < list.length; i += 1) {
        const person = list[i];
        const room = roomAhead(person, list, i);
        // Slow for the person in front rather than stopping dead behind them:
        // a pavement is not a lane, and people flow round each other.
        const crowding = room >= LOOK ? 1 : Math.max(0, (room - spacing) / (LOOK - spacing));
        person.v = person.pace * crowding;
        person.pending = person.v * dt;
      }
    }

    for (const person of people) {
      const edge = nav.edges[person.edge];
      person.s += (person.pending ?? 0) * person.dir;
      person.left -= Math.abs(person.pending ?? 0);
      person.phase += ((person.pending ?? 0) / stride) * Math.PI;
      person.pending = 0;
      const past = person.dir > 0 ? person.s >= edge.len : person.s <= 0;
      if (!past) continue;

      if (edge.kind === "cross") crossed += 1;
      if (person.left <= 0) { leaving.push(person); continue; }

      const at = person.dir > 0 ? edge.to : edge.from;
      const target = chooseNext(person, edge);
      if (target < 0) { leaving.push(person); continue; }
      const beyond = nav.edges[target];
      // A red light is a wall at the kerb, not a person standing in the road:
      // they hold at the end of the pavement they are on until it is theirs.
      if (!open(beyond)) {
        person.s = person.dir > 0 ? edge.len : 0;
        person.waiting += dt;
        waited += 1;
        continue;
      }
      person.waiting = 0;
      person.edge = target;
      person.dir = directionOn(beyond, at);
      person.s = person.dir > 0 ? 0 : beyond.len;
    }
    for (const person of leaving) people.splice(people.indexOf(person), 1);

    clock += dt;
  }

  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };

  /** Is this edge's first point inside the visible box? The traffic's test, for
   * the same reason: an edge is at most one corridor long. */
  function onScreen(edge, bounds) {
    if (!bounds || !edge) return true;
    const x = edge.pts[0] / model.tileM;
    const z = edge.pts[2] / model.tileM;
    return x >= bounds.x0 - 1 && x <= bounds.x1 + 1 && z >= bounds.y0 - 1 && z <= bounds.y1 + 1;
  }

  // A frozen street still has people on it (`?life=0` is for screenshots).
  // Settle first, then stop the clock — the traffic's decision, for the same
  // reason (V1).
  const SETTLE = 900;
  for (let i = 0; i < (live ? 0 : SETTLE); i += 1) step(1 / 30);
  if (!live) bucket();

  /** A frozen crowd settles ONCE more, the first time the camera says where it
   * is looking.
   *
   * The cap is spent nearest-first, and at construction nothing knows where the
   * camera will be — so a frozen city put its whole hundred and twenty people
   * wherever the derivation started listing pavements, and the shoot fixture's
   * nearest pedestrian was eighty-four metres behind a building. After this one
   * re-settle it is frozen for good: `?life=0` still means the same picture
   * twice. */
  let resettled = false;
  let focusPoint;
  function ensureSettled(bounds) {
    if (live || resettled || !bounds) return;
    resettled = true;
    people.length = 0;
    for (let i = 0; i < SETTLE; i += 1) step(1 / 30, bounds, focusPoint);
    bucket();
  }

  return {
    /** Wires the crossings to the cars (T1). */
    setTraffic(isBusy) { busyOn = isBusy; },

    update(dt, bounds, focus) {
      // Remembered even when frozen: `?life=0` settles the crowd lazily, on the
      // first frame that says where the camera is.
      focusPoint = focus;
      if (!live || !(dt > 0)) return;
      // A backgrounded tab hands back a delta of several seconds, and somebody
      // who advances forty metres in one step walks through a junction. Clamp
      // rather than sub-step, exactly as the traffic does.
      step(Math.min(dt, 1 / 15), bounds, focus);
    },

    /**
     * Writes everybody on screen into the instanced pools, in TILE units.
     *
     * The bob is the walk cycle and it is most of what makes a person read as a
     * person: without it a pedestrian is a box sliding along the pavement, and
     * the eye reads sliding as "this is not alive" faster than it reads any
     * amount of detail.
     */
    pose(pools, push, colours, bounds) {
      ensureSettled(bounds);
      const tileM = model.tileM;
      let posed = 0;
      for (const person of people) {
        const edge = nav.edges[person.edge];
        if (!edge) continue;
        if (!onScreen(edge, bounds)) continue;
        nav.sample(edge, person.s, out);
        const pool = pools[`ped${person.variant}`];
        if (!pool) continue;
        const lift = person.v > 0.05 ? Math.abs(Math.sin(person.phase)) * bob : 0;
        push(pool, out.x / tileM, (out.y + lift) / tileM, out.z / tileM, 1, 1, 1,
          colours[person.colour % colours.length],
          Math.atan2(-out.tz * person.dir, out.tx * person.dir));
        posed += 1;
      }
      return posed;
    },

    /** How many people are on screen — the same set `pose` writes, or the
     * budget is charged for a crowd nobody draws (R1.1's lesson). */
    count(bounds) {
      ensureSettled(bounds);
      if (!bounds) return people.length;
      let n = 0;
      for (const person of people) {
        const edge = nav.edges[person.edge];
        if (edge && onScreen(edge, bounds)) n += 1;
      }
      return n;
    },

    /**
     * Everybody currently IN a carriageway, as world points (A45).
     *
     * Cars yield to people, not the other way round: a crossing is a place a
     * person has right of way. Only people on a `cross` edge count — somebody
     * on a pavement is not in anybody's road.
     */
    yields() {
      const list = [];
      for (const person of people) {
        const edge = nav.edges[person.edge];
        if (!edge || edge.kind !== "cross") continue;
        nav.sample(edge, person.s, out);
        list.push({ x: out.x, z: out.z });
      }
      return list;
    },

    people: () => people.slice(),
    clock: () => clock,
    get waited() { return waited; },
    get crossed() { return crossed; },
  };
}

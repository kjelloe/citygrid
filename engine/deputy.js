// The deputy mayor: an AI that runs a seat.
//
// It is a bonus feature (it runs a departed player's city under a readable
// doctrine) and the project's primary measurement instrument at the same time.
// Every soak and every sweep city is played by these, so doctrine is gated
// like gameplay code, because it IS the gameplay being measured.
//
// Deliberately simple and legible: a player should be able to read the
// doctrine name and predict roughly what their city will look like when they
// come back.

import { apply } from "./reducer.js";
import {
  CMD_PLACE_ROAD, CMD_PAINT_ZONE, CMD_DEZONE, CMD_PLACE_WIRE, CMD_PLACE_PIPE, CMD_PLACE_RAIL,
  CMD_PLACE_BUILDING, CMD_BULLDOZE,
} from "./commands.js";
import { definition } from "./catalogue.js";
import { isUnlocked } from "./unlock.js";
import { rules } from "./rules.js";
import { i32 } from "../shared/arrays.js";
import { budgetFor } from "./economy.js";
import { RESULT } from "../shared/protocol.js";
import { canZone } from "./permissions.js";
import { tileAt, xOf, yOf, encodeRuns, inBounds, DIR4, neighbour } from "../shared/grid.js";
import { hasNet } from "./network.js";
import { isBuildable, isWater, waterBodies, bodyAt } from "./terrain.js";
import { idiv, clamp } from "../shared/idiv.js";
import { mix32 } from "../shared/prng.js";
import {
  ZONE_NONE, ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL, OWNER_NATURE,
  FLAG_POWERED, FLAG_WATERED, TERRAIN_ROCK,
} from "./constants.js";

export var DOCTRINE_EXPAND = "expand";
export var DOCTRINE_HOLD = "hold";
export var DOCTRINE_BALANCE = "balance";
export var DOCTRINE_GREEN = "green";

/** A deputy keeps its own scratch state OUTSIDE the game state: where it was
 * last building, which way it is heading. None of it is hashed, because two
 * clients running the same replay must not need the same deputy mood. */
export function makeDeputy(seat, doctrine) {
  return {
    seat: seat,
    doctrine: doctrine ? doctrine : DOCTRINE_EXPAND,
    cursorX: -1,
    cursorY: -1,
    hubX: -1,
    hubY: -1,
    built: 0, avenues: 0, stations: 0, marinas: 0, terminals: 0,
    // Crossings the deputy went looking for (Q143, A121), as against the ones a
    // block happened to meet.
    bridges: 0,
    // The index of the next draw from the deputy's own stream, reset every
    // turn (Q113).
    rolls: 0,
    zoned: 0,
    utilities: 0,
    refusals: 0,
    // Carrier runs that reached nothing at all (G2). A connect run that finds
    // no route is silent — no command, no refusal — which is how two clinics
    // sealed inside a block of buildings went unnoticed for the project's life.
    unconnected: 0,
  };
}

/**
 * The deputy's OWN randomness (Q113).
 *
 * It used to draw from `state.rng` — the same stream `development.js`,
 * `fire.js` and `disasters.js` draw from — so one extra deputy action shifted
 * when every later fire started and every later building grew. That is why
 * T1a's avenue and "skip one turn and issue nothing" produced numbers
 * identical to the last digit: the CONTENT of the action was irrelevant and
 * only the draw count mattered, and a sweep comparing two eras was comparing
 * two different worlds rather than two rules.
 *
 * A mayor's dithering must not change the weather. The stream is a pure
 * function of the seed, the tick, the seat and the draw's index WITHIN the
 * turn — reset every turn — so an extra decision does not move the deputy's
 * own later rolls either, and the same turn of the same game always rolls the
 * same numbers however it got there.
 *
 * Still deterministic and still reproducible on every client: `deputy.rolls`
 * is a counter on the driver's record, not hashed state, and it is a function
 * of decisions that are themselves a function of state.
 */
export function deputyRoll(state, deputy, bound) {
  if (bound <= 1) return 0;
  var index = deputy.rolls;
  deputy.rolls += 1;
  // `Math.imul` rather than `*`: a tick times a 32-bit constant leaves the
  // integer range and comes back through a double, which is exact here and
  // would stop being exact if a tick ever grew. The rest of `engine/` mixes
  // the same way (`terrain.js`).
  var turn = mix32((state.options.seed ^ Math.imul(state.tick | 0, 2654435761)) >>> 0);
  return mix32((turn ^ Math.imul(deputy.seat | 0, 0x9e3779b1) ^ index) >>> 0) % bound;
}

/** The deputy's own draw, by its readable name inside this module. Exported
 * above as `deputyRoll` for the one test that pins A82's invariant: the value
 * must not depend on how far `state.rng` has been advanced. */
function roll(state, deputy, bound) {
  return deputyRoll(state, deputy, bound);
}

/** True one time in `oneIn`, from the deputy's own stream. */
function rollChance(state, deputy, oneIn) {
  return roll(state, deputy, oneIn) === 0;
}

/** Every command the deputy issues goes through here, so a probe can watch
 * what it actually did rather than inferring it from the world afterwards. */
function issue(state, deputy, command) {
  var outcome = apply(state, command);
  if (deputy.sink) deputy.sink(outcome);
  return outcome;
}

function treasuryOf(state, seat) {
  for (var i = 0; i < state.players.length; i += 1) {
    if (state.players[i].seat === seat) return state.players[i].treasury;
  }
  return 0;
}

/** Picks somewhere to start: near the middle of the seat's own district when
 * there is one, otherwise near the middle of the map. */
function findStart(state, seat) {
  var bestIndex = -1;
  var bestScore = -1;
  var centreX = idiv(state.width, 2);
  var centreY = idiv(state.height, 2);
  for (var i = 0; i < state.width * state.height; i += 1) {
    if (!isBuildable(state.tiles.terrain[i])) continue;
    var owner = state.tiles.owner[i];
    if (owner !== OWNER_NATURE && owner !== seat) continue;
    var district = state.tiles.district[i];
    var mine = district === seat ? 400 : 0;
    var dx = xOf(state.width, i) - centreX;
    var dy = yOf(state.width, i) - centreY;
    var score = mine + 300 - (Math.abs(dx) + Math.abs(dy));
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/** How far from its town this deputy may lay a road (A81, B9): the doctrine's
 * `roadReach`, from the data. */
function reachOf(deputy) {
  var table = rules().deputy.roadReach;
  var reach = table[deputy.doctrine];
  return reach === undefined ? table.balance : reach;
}

/** Steps from every tile to the nearest lot of this seat that is BUILT, or
 * zoned with power and water — over the four neighbours — and how many such
 * lots there are. A road is laid only within reach of one (A81): the grid grows
 * outward with the town instead of ahead of it, which is what gave the played
 * city a grid of empty roads across the river and no edge (D4 finding 2). */
function townReach(state, seat, reach) {
  var w = state.width;
  var h = state.height;
  var dist = i32(w * h);
  var queue = i32(w * h);
  var fringe = i32(w * h);
  var fringeCount = 0;
  var tail = 0;
  for (var i = 0; i < w * h; i += 1) {
    dist[i] = -1;
    if (state.tiles.owner[i] !== seat) continue;
    var built = state.tiles.buildingId[i] !== 0;
    var flags = state.tiles.flags[i];
    var supplied = state.tiles.zone[i] !== ZONE_NONE
      && (flags & FLAG_POWERED) !== 0 && (flags & FLAG_WATERED) !== 0;
    if (built || supplied) {
      dist[i] = 0;
      queue[tail] = i;
      tail += 1;
    }
  }
  var lots = tail;
  for (var head = 0; head < tail; head += 1) {
    var at = queue[head];
    var x = xOf(w, at);
    var y = yOf(w, at);
    for (var d = 0; d < 4; d += 1) {
      var nx = x + DIR4[d].dx;
      var ny = y + DIR4[d].dy;
      if (!inBounds(w, h, nx, ny)) continue;
      var j = tileAt(w, nx, ny);
      if (dist[j] >= 0) continue;
      dist[j] = dist[at] + 1;
      queue[tail] = j;
      tail += 1;
    }
  }
  // The FRINGE: fresh land two to `reach` steps out from the town — buildable,
  // unzoned, unpaved, unbuilt and ours to build on. A blocked deputy hops here,
  // so the town grows outward; hopped to a lot instead, it laid its next block
  // INSIDE the town, and the first cut of B9 turned every town into a mesh of
  // empty streets. Refusing zoned land and parallel roads instead cut the
  // sweep's population by half: crossing a zoned strip is how blocks join.
  for (var k = 0; k < tail; k += 1) {
    var f = queue[k];
    if (dist[f] < 2 || dist[f] > reach) continue;
    if (state.tiles.zone[f] !== ZONE_NONE || hasNet(state.tiles.road[f]) || state.tiles.buildingId[f] !== 0) continue;
    if (!isBuildable(state.tiles.terrain[f])) continue;
    var fo = state.tiles.owner[f];
    if (fo !== OWNER_NATURE && fo !== seat) continue;
    fringe[fringeCount] = f;
    fringeCount += 1;
  }
  return { dist: dist, lots: lots, queue: queue, fringe: fringe, fringeCount: fringeCount };
}

/** Zoning under a street the deputy has just laid stops being zoning (H4, A97).
 *
 * The deputy crosses its own zoned land on purpose — B9 measured that refusing
 * to cross a zoned strip cut the sweep's population by half, because crossing
 * one is how blocks join — and since G1 a lot cannot grow on a road. So those
 * tiles were zoning that had been paid for and could never be used: **639 of
 * 1,646 a city, two in five.** Dezoning them changes no growth and tells the
 * truth in the overlay.
 *
 * Every path that lays road comes through here, not just `buildBlock`: the rail
 * station's access road and the ferry terminal's are `connectToNetwork` runs,
 * and leaving them out left exactly one zoned-and-paved tile a city — which is
 * the kind of remainder that reads as a rounding error and is a missed caller.
 */
function dezoneUnder(state, deputy, cells) {
  var zoned = [];
  for (var i = 0; i < cells.length; i += 1) {
    if (state.tiles.zone[cells[i]] !== ZONE_NONE) zoned.push(cells[i]);
  }
  if (zoned.length === 0) return;
  issue(state, deputy, { type: CMD_DEZONE, actor: deputy.seat, runs: encodeRuns(zoned) });
}

/** Lays a road segment and zones the strip on both sides of it — the pattern a
 * person actually uses, and the reason growth follows roads rather than
 * appearing in fields. */
function buildBlock(state, deputy, town) {
  var horizontal = rollChance(state, deputy, 2);
  // Both ways before giving up (J3, A112). The axis is a coin flip, and since a
  // road run stops at the first tile too steep to pave, a cursor standing with a
  // hillside one way and a valley the other failed half the time for no reason —
  // which on `hilly` is most cursors and was a city of four buildings.
  if (buildBlockAlong(state, deputy, town, horizontal)) return true;
  return buildBlockAlong(state, deputy, town, !horizontal);
}

function buildBlockAlong(state, deputy, town, horizontal) {
  var seat = deputy.seat;
  var reach = reachOf(deputy);
  var length = 6 + roll(state, deputy, 6);
  var x = deputy.cursorX;
  var y = deputy.cursorY;

  var roadCells = [];
  // A crossing in progress (S13, A84): water tiles the run has stepped onto and
  // not yet brought to land. They join the run when a bank accepts them and are
  // DROPPED if none does — a run that ends on water is refused by
  // `crossingRefusal`, and a refused run is a deputy turn spent on nothing.
  var pending = [];
  var lastLand = -1;
  // `length` is a count of STREET tiles, and the span of a bridge is not street
  // — it is what the street crosses. Counting the water against the block's
  // length meant a run that met a river had three tiles left for the far bank,
  // so the five crossings a twenty-year city attempts all ran out before they
  // reached it.
  var lands = 0;
  var step = -1;
  while (lands < length) {
    step += 1;
    var rx = horizontal ? x + step : x;
    var ry = horizontal ? y : y + step;
    if (!inBounds(state.width, state.height, rx, ry)) break;
    var index = tileAt(state.width, rx, ry);
    var owner = state.tiles.owner[index];
    if (owner !== OWNER_NATURE && owner !== seat) break;
    var wet = isWater(state.tiles.terrain[index]);
    if (!wet && !isBuildable(state.tiles.terrain[index])) break;
    if (wet) {
      // Nothing to bridge FROM, or a span longer than a bridge: either way the
      // block stops here. The span is the engine's own limit, so the deputy
      // asks for exactly what `placeNetwork` will accept.
      if (roadCells.length === 0 || pending.length >= rules().build.bridgeSpan) break;
      pending.push(index);
      continue;
    }
    if (state.tiles.buildingId[index] !== 0) break;
    // And not up a cliff (J3, A112): the step ALONG the street, which is what it
    // climbs. A road run is a transaction, so one step too steep refuses the
    // whole block — the deputy stops the street at the foot of the hill rather
    // than discovering the refusal and wasting the turn, which is what it
    // already does when it zones.
    //
    // A step ACROSS water is not a climb: the deck spans it (S13), and a water
    // tile's elevation is its bed — which is why the river was a cliff to this
    // rule and the deputy had never crossed one. The far bank is measured
    // against the near one, not against the bed.
    if (lastLand >= 0 && pending.length === 0) {
      var rise = state.tiles.elevation[index] - state.tiles.elevation[lastLand];
      if (rise < 0) rise = -rise;
      if (rise > rules().development.maxRoadSlope) break;
    }
    // Within reach of the town (A81). With nothing that qualifies yet — the
    // first street of a new city — there is no town to be near, and a rule with
    // no exception for it is a deputy that never lays one.
    if (town.lots > 0 && (town.dist[index] < 0 || town.dist[index] > reach)) break;
    for (var p = 0; p < pending.length; p += 1) roadCells.push(pending[p]);
    pending = [];
    roadCells.push(index);
    lastLand = index;
    lands += 1;
  }
  if (roadCells.length < 3) return false;

  var placed = issue(state, deputy, { type: CMD_PLACE_ROAD, actor: seat, runs: encodeRuns(roadCells) });
  if (placed.result !== RESULT.OK) {
    deputy.refusals += 1;
    return false;
  }
  deputy.built += 1;

  // What this street was just laid across stops being zoning (H4, A97).
  //
  // The deputy crosses its own zoned land on purpose — B9 measured that refusing
  // to cross a zoned strip cut the sweep's population by half, because crossing
  // one is how blocks join — and since G1 a lot cannot grow on a road, so those
  // tiles were zoning that had been paid for and could never be used: **639 of
  // 1,646 a city, two in five**. Dezoning them changes no growth and tells the
  // truth in the overlay.
  dezoneUnder(state, deputy, roadCells);

  // Utilities follow the street, and then join the grid. Laying them per
  // block without connecting the blocks produced a map full of separate
  // networks, none of which had a power station on it: half the cities never
  // developed a single house.
  issue(state, deputy, { type: CMD_PLACE_WIRE, actor: seat, runs: encodeRuns(roadCells) });
  issue(state, deputy, { type: CMD_PLACE_PIPE, actor: seat, runs: encodeRuns(roadCells) });
  connectToHub(state, deputy, roadCells[0]);

  // What to zone: whatever the region is shortest of. The deputy reads the
  // same regional demand pool the player sees, which is what makes it a
  // measurement instrument rather than a cheat.
  var zone = pickZone(state, deputy);
  var zoneCells = [];
  for (var k = 0; k < roadCells.length; k += 1) {
    var cx = xOf(state.width, roadCells[k]);
    var cy = yOf(state.width, roadCells[k]);
    var sides = horizontal ? [[cx, cy - 1], [cx, cy + 1]] : [[cx - 1, cy], [cx + 1, cy]];
    for (var s = 0; s < sides.length; s += 1) {
      var zx = sides[s][0];
      var zy = sides[s][1];
      if (!inBounds(state.width, state.height, zx, zy)) continue;
      var zi = tileAt(state.width, zx, zy);
      if (!isBuildable(state.tiles.terrain[zi])) continue;
      if (hasNet(state.tiles.road[zi])) continue;
      if (state.tiles.zone[zi] !== ZONE_NONE) continue;
      var zOwner = state.tiles.owner[zi];
      if (zOwner !== OWNER_NATURE && zOwner !== seat) continue;
      // And not a slope a street could not climb (H6, A100). The reducer
      // refuses it, and a zoning run is a transaction — one steep tile in the
      // strip would refuse the whole block, so on a `hilly` map the deputy
      // would zone nothing at all rather than zone around the cliff.
      if (canZone(state, seat, zi) !== RESULT.OK) continue;
      zoneCells.push(zi);
    }
  }
  if (zoneCells.length > 0) {
    var zoned = issue(state, deputy, { type: CMD_PAINT_ZONE, actor: seat, runs: encodeRuns(zoneCells), zone: zone });
    if (zoned.result === RESULT.OK) deputy.zoned += 1;
    else deputy.refusals += 1;
  }

  // Walk on from the end of the road, so blocks chain into a neighbourhood.
  var last = roadCells[roadCells.length - 1];
  deputy.cursorX = xOf(state.width, last) + (horizontal ? 0 : roll(state, deputy, 5) - 2);
  deputy.cursorY = yOf(state.width, last) + (horizontal ? roll(state, deputy, 5) - 2 : 0);
  deputy.cursorX = clamp(deputy.cursorX, 1, state.width - 2);
  deputy.cursorY = clamp(deputy.cursorY, 1, state.height - 2);
  return true;
}

function pickZone(state, deputy) {
  var r = state.demand.residential;
  var c = state.demand.commercial;
  var i = state.demand.industrial;

  if (deputy.doctrine === DOCTRINE_GREEN) {
    // Green first: industry only when there is no alternative.
    if (r >= c) return ZONE_RESIDENTIAL;
    return ZONE_COMMERCIAL;
  }
  if (r >= c && r >= i) return ZONE_RESIDENTIAL;
  if (c >= i) return ZONE_COMMERCIAL;
  return ZONE_INDUSTRIAL;
}

/** Keeps the lights on. A deputy that zones without supplying is a deputy
 * that builds a slum, so utilities come before expansion — the same priority
 * a person applies without being told. */
function keepSupplied(state, deputy) {
  var supply = state.supply;
  var seat = deputy.seat;

  // Once there is zoned land, not once there is demand: nothing develops
  // without supply now, so waiting for demand would deadlock — no supply, no
  // buildings, no demand, no supply. Waiting for zoning instead is also how a
  // person does it.
  if (deputy.zoned === 0) return false;
  var needsPower = supply.power.demand + 20 > supply.power.capacity;
  var needsWater = supply.water.demand + 20 > supply.water.capacity;
  if (!needsPower && !needsWater) return false;

  // Green doctrine pays more for less: several turbines rather than one
  // chimney. It is the readable difference between the two doctrines.
  // Power and water are handled independently in the same turn. Alternating
  // between them left a city with one power station and four pumps: whichever
  // was short when the other was fine simply never came up.
  var acted = false;
  if (needsPower) {
    acted = placeUtility(state, deputy, deputy.doctrine === DOCTRINE_GREEN ? "windTurbine" : "coalPlant") || acted;
  }
  if (needsWater) {
    acted = placeUtility(state, deputy, pickPump(state, deputy)) || acted;
  }
  return acted;
}

/** One dark building a turn put back on a live grid (H5, A96, Q130).
 *
 * G2 made every carrier RUN reach a live piece of grid and left the other half
 * open: a disaster cuts a line, the component behind it loses its producer, and
 * the deputy — which connects a building when it BUILDS it and never looks
 * again — never notices. Measured before this rule: cutting 34 wire tiles on
 * seed 1003 darkened 84 buildings of 234, and a year later 54 were still dark;
 * on seed 404, 80 went dark and SIX were still dark five years on. What repair
 * there was came incidentally, from G2's rule running new buildings' carriers to
 * a live piece.
 *
 * Only when the city HAS the capacity: a brown-out is a shortfall to build out
 * of, not a grid to re-stitch, and `keepSupplied` above is what answers that.
 * One a turn, so a shattered grid comes back over months — a mayor repairing
 * forty lines in an afternoon is not a mayor anybody would believe.
 */
function reconnectDark(state, deputy, kind, layer, command, flag) {
  var supply = state.supply[kind];
  if (supply.starved === 0 || supply.demand > supply.capacity) return false;
  for (var i = 0; i < state.buildings.length; i += 1) {
    var building = state.buildings[i];
    if (building.owner !== deputy.seat) continue;
    var index = tileAt(state.width, building.x, building.y);
    if ((state.tiles.flags[index] & flag) !== 0) continue;
    // Not from a PRODUCER. A plant whose own tile is dark is a plant on a
    // component that is short of capacity, which is `keepSupplied`'s problem
    // and not a route to find — and the first cut of this spent two hundred and
    // forty turns running carriers out of the same coal plant while the city it
    // was meant to be repairing stopped growing.
    var def = definition(building.def);
    if (def && ((kind === "power" && def.power > 0) || (kind === "water" && def.water > 0))) continue;
    // And only a run that actually LAYS something counts as the turn's work.
    if (connectToNetwork(state, deputy, index, layer, command, flag)) return true;
  }
  return false;
}

function repairGrid(state, deputy) {
  if (deputy.zoned === 0) return false;
  if (reconnectDark(state, deputy, "power", "wire", CMD_PLACE_WIRE, FLAG_POWERED)) return true;
  return reconnectDark(state, deputy, "water", "pipe", CMD_PLACE_PIPE, FLAG_WATERED);
}

function placeUtility(state, deputy, def) {
  if (!def) return false;
  var spot = findSpotFor(state, deputy, def);
  if (spot < 0) return false;

  var placed = issue(state, deputy, {
    type: CMD_PLACE_BUILDING, actor: deputy.seat, def: def,
    x: xOf(state.width, spot), y: yOf(state.width, spot),
  });
  if (placed.result !== RESULT.OK) {
    deputy.refusals += 1;
    return false;
  }
  deputy.utilities += 1;
  // Where it went, for the caller that has to run something else to it. The
  // alternative is `placeUtility` returning a tile instead of a boolean, and
  // every one of its six callers learning about that.
  lastSpot = spot;
  // The first plant becomes the grid hub every later block connects to.
  if (deputy.hubX < 0) {
    deputy.hubX = xOf(state.width, spot);
    deputy.hubY = yOf(state.width, spot) - 1;
    if (deputy.hubY < 0) deputy.hubY = yOf(state.width, spot) + definition(def).h;
  }
  // A plant nobody is connected to is scenery, so the carrier goes down with
  // it: wire and pipe both, from the new building back to a LIVE piece of the
  // grid. Until G2 only the things whose whole point is to be live asked for
  // that (a `liveGrid` argument, T2's Q117) and everything else took the
  // nearest carrier of any kind; the argument is gone because the answer is
  // the same for every building.
  connectToHub(state, deputy, spot);
  return true;
}

function pickPump(state, deputy) {
  // Past a certain size a town stops adding pumps and digs a reservoir: more
  // water for less ground and less upkeep per unit, which is the whole reason
  // the row exists (T7). It needs no shore.
  if (state.population >= rules().deputy.reservoirAtPopulation) return "reservoir";
  // A surface pump is cheaper and stronger but needs a shore. In a dry region
  // there is no shore, and the groundwater pump is the whole answer.
  for (var i = 0; i < state.tiles.terrain.length; i += 1) {
    if (isWater(state.tiles.terrain[i])) return "waterPump";
  }
  return "groundwaterPump";
}

/** Somewhere clear, owned or ownable, and near where this deputy has been
 * building. Surface pumps additionally need a shore. */
/** A fire station for every `deputy.buildingsPerStation` buildings standing
 * (B1a, A62).
 *
 * The deputy has never built one. Until B1a that cost nothing — a fire took the
 * house it started in and went out — and every gate city in the project has
 * been played with no fire service at all. A fire nobody fights now takes the
 * block, so a mayor that never builds a station is a mayor whose city burns,
 * and the deputy is the mayor in every headless game.
 */
function keepCovered(state, deputy) {
  if (deputy.zoned === 0) return false;
  var cfg = rules().deputy;
  var stations = 0;
  var police = 0;
  var others = 0;
  for (var i = 0; i < state.buildings.length; i += 1) {
    var b = state.buildings[i];
    if (b.owner !== deputy.seat) continue;
    if (b.def === "fireStation") stations += 1;
    else if (b.def === "policeStation") police += 1;
    else others += 1;
  }
  if (stations * cfg.buildingsPerStation < others) {
    return placeUtility(state, deputy, "fireStation");
  }
  // And a POLICE station, on the same rule (H3, A99/Q111). B1a taught the
  // deputy fire stations because a fire that spreads has to be answerable;
  // crime has no such pressure, so it has built none in the project's life and
  // `lanes_dump` read 6 fire stations and 0 police on a played 64x64. B3b's
  // patrols are correct, tested, and invisible in every city this project has
  // measured.
  // `(n + 1) * per <= others`, not `n * per < others` — the second is true the
  // moment a town has ONE building, which is how T7's clinic bought itself at a
  // town of one and bankrupted it. The fire station above keeps its own older
  // form deliberately: a town wants a fire service from the first house.
  if ((police + 1) * cfg.buildingsPerPolice <= others) {
    return placeUtility(state, deputy, "policeStation");
  }
  return false;
}

/** A school for every `deputy.buildingsPerSchool` buildings, and somewhere to
 * sit for every `deputy.buildingsPerPlaza` (T6, A67/A70).
 *
 * The same argument as the fire station's, from the other side: leisure and
 * education are coverage layers that drive desirability and demand, and a
 * deputy that never builds for them is a mayor whose city reads both as zero —
 * which is how every sweep number in the project would have been measured on a
 * town with no school in it.
 *
 * A PLAZA rather than a park, because a park is 1x1 and the deputy's spot
 * search would scatter forty of them; the plaza is the same idea at 2x2 with a
 * radius worth having.
 */
function keepAmused(state, deputy) {
  if (deputy.zoned === 0) return false;
  var cfg = rules().deputy;
  var schools = 0;
  var plazas = 0;
  var parks = 0;
  var others = 0;
  for (var i = 0; i < state.buildings.length; i += 1) {
    var b = state.buildings[i];
    if (b.owner !== deputy.seat) continue;
    if (b.def === "school") schools += 1;
    else if (b.def === "plaza") plazas += 1;
    else if (b.def === "park") parks += 1;
    else others += 1;
  }
  if (schools * cfg.buildingsPerSchool < others) return placeUtility(state, deputy, "school");
  if (plazas * cfg.buildingsPerPlaza < others) return placeUtility(state, deputy, "plaza");
  // And a PARK, which is the cheapest thing in the catalogue and the smallest
  // thing carrying `landValueBonus` (H3, A99/Q133). T6 chose the plaza over it
  // because a 1x1 scatters — true, and it is why the park is RATIONED at one
  // per `buildingsPerPark` rather than built whenever there is room. G3 made
  // the bonus a rule and then measured that no headless city had a single park
  // in it to carry one.
  if ((parks + 1) * cfg.buildingsPerPark <= others) return placeUtility(state, deputy, "park");
  return false;
}

/** The cheap rows the deputy considers (T7, A70).
 *
 * Four more decisions in the shape `keepCovered` and `keepAmused` already have,
 * and for the same reason: a row nobody builds is a row no headless city has,
 * and every sweep in this project is played by this mayor.
 *
 *   a clinic   — one per `buildingsPerClinic`, which is the cheapest health
 *                there is and the only one a young town can afford
 *   the HQs    — once, each, past `headquartersAtPopulation`: a bigger radius
 *                for a town that has outgrown its stations
 *   the tip    — when the city's own pollution average passes `tipAtPollution`,
 *                which is the number the civic pass already computes
 */
function keepTidy(state, deputy) {
  if (deputy.zoned === 0) return false;
  var cfg = rules().deputy;
  var clinics = 0;
  var policeHQs = 0;
  var fireHQs = 0;
  var tips = 0;
  var others = 0;
  for (var i = 0; i < state.buildings.length; i += 1) {
    var b = state.buildings[i];
    if (b.owner !== deputy.seat) continue;
    if (b.def === "clinic") clinics += 1;
    else if (b.def === "policeHQ") policeHQs += 1;
    else if (b.def === "fireHQ") fireHQs += 1;
    else if (b.def === "wasteFacility") tips += 1;
    else others += 1;
  }
  // The ONE-OFFS first. A clinic is wanted every thirty buildings for ever, so
  // leaving it first means it is the only thing this turn ever does: thirteen
  // clinics and no headquarters, measured, because `keepTidy` returns as soon
  // as anything fires and the town never stops growing past the next clinic.
  if (state.population >= cfg.headquartersAtPopulation) {
    if (policeHQs < 1) return placeUtility(state, deputy, "policeHQ");
    if (fireHQs < 1) return placeUtility(state, deputy, "fireHQ");
  }
  // `(n + 1) * per <= others`, not `n * per < others`: the second form is true
  // the moment a town has one building of anything, so the first clinic and the
  // first tip were bought before the first resident. Measured on seed 1003:
  // the town peaked at SIXTY people against 1,260 without them, because two
  // upkeep rows in a village is a deputy permanently under its own reserve.
  if ((clinics + 1) * cfg.buildingsPerClinic <= others) {
    return placeUtility(state, deputy, "clinic");
  }
  // And the tip waits for a town as well as for dirt: `pollutionAverage` is
  // over DEVELOPED land (era 1), so two power stations and nine houses is a
  // filthy city by that measure and always has been.
  if (tips < 1 && state.population >= cfg.tipAtPopulation
    && state.civic.pollutionAverage > cfg.tipAtPollution) {
    return placeUtility(state, deputy, "wasteFacility");
  }
  return false;
}

/** Clears the burnt-out ground inside the town, and puts its zoning back (B1a).
 *
 * Nothing in a headless city has ever cleared a ruin: `clearRuin` had no caller
 * and the bulldoze command is the player's. That cost nothing while a fire took
 * one house every few years; with a fire that spreads it is 36 tiles of dead
 * ground per city by year 25, which development skips forever. Bulldozing also
 * clears the ZONE — it is one command for "give me back the bare ground" — so
 * the zoning goes back on in the same turn, or the deputy tidies its town into
 * a field.
 *
 * Reads `state.derelicts` since X3c rather than sweeping 16,384 tiles. The list
 * is kept sorted by tile and holds exactly the ruins, which is why the swap
 * cannot move a single deputy decision — the scan visited the same tiles in the
 * same order. `test/disasters.test.js` derives both ways and compares, because
 * a reuse nobody checks is a reuse that hides its mistakes (W6a).
 */
function clearRuins(state, deputy, town) {
  var reach = reachOf(deputy);
  var ruined = [];
  var zones = [];
  for (var d = 0; d < state.derelicts.length; d += 1) {
    var i = state.derelicts[d].tile;
    var owner = state.tiles.owner[i];
    if (owner !== deputy.seat && owner !== OWNER_NATURE) continue;
    if (town.lots > 0 && (town.dist[i] < 0 || town.dist[i] > reach)) continue;
    ruined.push(i);
    zones.push(state.tiles.zone[i]);
  }
  if (ruined.length === 0) return false;

  var cleared = issue(state, deputy, { type: CMD_BULLDOZE, actor: deputy.seat, runs: encodeRuns(ruined) });
  if (cleared.result !== RESULT.OK) {
    deputy.refusals += 1;
    return false;
  }
  // Back to what it was zoned for, one command per zone.
  var kinds = [ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL];
  for (var k = 0; k < kinds.length; k += 1) {
    var again = [];
    for (var j = 0; j < ruined.length; j += 1) if (zones[j] === kinds[k]) again.push(ruined[j]);
    if (again.length === 0) continue;
    issue(state, deputy, { type: CMD_PAINT_ZONE, actor: deputy.seat, runs: encodeRuns(again), zone: kinds[k] });
  }
  deputy.cleared = (deputy.cleared || 0) + ruined.length;
  return true;
}

/** The town's first trunk road, once it has grown (T1a, A60).
 *
 * An UPGRADE, not a new street. The first cut laid the avenue as the deputy's
 * next block, which lands wherever the cursor is — on fresh ground at the edge
 * of town, by B9's fringe rule — and on four played cities those avenues
 * carried a mean load of exactly **zero**. A trunk road is the street the
 * traffic is already on, so this widens the busiest run the seat owns.
 */
function upgradeTrunk(state, deputy) {
  if (deputy.avenues >= 1) return false;
  if (state.population < rules().deputy.avenueAtPopulation) return false;

  var width = state.width;
  var total = width * state.height;
  var best = -1;
  var bestLoad = 0;
  var i;
  for (i = 0; i < total; i += 1) {
    if (!hasNet(state.tiles.road[i])) continue;
    if (state.tiles.owner[i] !== deputy.seat) continue;
    if (state.tiles.traffic[i] <= bestLoad) continue;
    bestLoad = state.tiles.traffic[i];
    best = i;
  }
  if (best < 0 || bestLoad <= 0) return false;

  // The longer of the two runs through that tile, so the avenue follows the
  // street rather than crossing it.
  var bx = xOf(width, best);
  var by = yOf(width, best);
  var span = rules().deputy.avenueTiles;
  var alongX = [];
  var alongY = [];
  var step;
  for (step = -span; step <= span; step += 1) {
    var hx = bx + step;
    if (hx >= 0 && hx < width && hasNet(state.tiles.road[tileAt(width, hx, by)])) alongX.push(tileAt(width, hx, by));
    var hy = by + step;
    if (hy >= 0 && hy < state.height && hasNet(state.tiles.road[tileAt(width, bx, hy)])) alongY.push(tileAt(width, bx, hy));
  }
  var run = alongX.length >= alongY.length ? alongX : alongY;
  if (run.length < 4) return false;

  var done = issue(state, deputy, {
    type: CMD_PLACE_ROAD, actor: deputy.seat, kind: "avenue", runs: encodeRuns(run),
  });
  if (done.result !== RESULT.OK) {
    deputy.refusals += 1;
    return false;
  }
  deputy.avenues += 1;
  return true;
}

/**
 * A straight run of rail from beside a station's footprint to the nearest map
 * edge, or `undefined` when no side has a clear one (T2).
 *
 * Straight, and one of four: this is a mayor laying a branch line, not a
 * pathfinder. A run that meets rock or a building is abandoned rather than
 * routed around, and the next side is tried — if all four are blocked the
 * station is not built this turn and the deputy comes back when its cursor has
 * moved.
 */
function lineToEdge(state, x, y, def) {
  var width = state.width;
  var height = state.height;
  var sides = [
    { sx: x - 1, sy: y, dx: -1, dy: 0 },
    { sx: x + def.w, sy: y, dx: 1, dy: 0 },
    { sx: x, sy: y - 1, dx: 0, dy: -1 },
    { sx: x, sy: y + def.h, dx: 0, dy: 1 },
  ];
  var best;
  for (var s = 0; s < sides.length; s += 1) {
    var side = sides[s];
    var cx = side.sx;
    var cy = side.sy;
    var cells = [];
    var clear = true;
    while (cx >= 0 && cy >= 0 && cx < width && cy < height) {
      var index = tileAt(width, cx, cy);
      if (state.tiles.buildingId[index] !== 0) { clear = false; break; }
      if (state.tiles.terrain[index] === TERRAIN_ROCK) { clear = false; break; }
      cells.push(index);
      cx += side.dx;
      cy += side.dy;
    }
    if (!clear || cells.length === 0) continue;
    if (!best || cells.length < best.length) best = cells;
  }
  return best;
}

/**
 * A line to the edge and a station on it, once the town is big enough (T2).
 *
 * The order matters: the rail goes down FIRST, because `needsRail` refuses a
 * station with no line to stand on. Then the wire, the pipe and a road — a
 * station with no power or no road access is built, standing, costing upkeep
 * and DEAD, which is a thing the player can do and the deputy should not.
 */
function openTheLine(state, deputy) {
  if (deputy.stations >= 1) return false;
  if (state.population < rules().deputy.railAtPopulation) return false;

  var def = definition("railStation");
  var spot = findSpotFor(state, deputy, "railStation");
  if (spot < 0) return false;
  var sx = xOf(state.width, spot);
  var sy = yOf(state.width, spot);

  var run = lineToEdge(state, sx, sy, def);
  if (!run) return false;

  var laid = issue(state, deputy, {
    type: CMD_PLACE_RAIL, actor: deputy.seat, runs: encodeRuns(run),
  });
  if (laid.result !== RESULT.OK) {
    deputy.refusals += 1;
    return false;
  }
  var placed = issue(state, deputy, {
    type: CMD_PLACE_BUILDING, actor: deputy.seat, def: "railStation", x: sx, y: sy,
  });
  if (placed.result !== RESULT.OK) {
    deputy.refusals += 1;
    return false;
  }
  deputy.stations += 1;
  // To a LIVE piece of grid, not the nearest wire (see `connectToNetwork`): a
  // station on a dead stub is built, standing, costing upkeep and dead, and
  // the only thing that would ever have said so is this slice's own test.
  connectToNetwork(state, deputy, spot, "wire", CMD_PLACE_WIRE, FLAG_POWERED);
  connectToNetwork(state, deputy, spot, "pipe", CMD_PLACE_PIPE, FLAG_WATERED);
  connectToNetwork(state, deputy, spot, "road", CMD_PLACE_ROAD);
  return true;
}

/** The water bodies, once a turn rather than once a candidate tile: the spot
 * search walks every tile of the map and a flood fill per tile is a turn that
 * never ends. */
/** The tile `placeUtility` last built on. */
var lastSpot = -1;

var bodyCache = { tick: -1, width: -1, list: [] };
function bodies(state) {
  if (bodyCache.tick === state.tick && bodyCache.width === state.width) return bodyCache.list;
  bodyCache = { tick: state.tick, width: state.width, list: waterBodies(state) };
  return bodyCache.list;
}

/**
 * A marina on a big enough body, and a ferry terminal on one that reaches the
 * edge (T4, A67, A68).
 *
 * One a turn and one of each, in that order: the marina is the cheaper and is
 * worth having on any region with water in it, while a terminal is a gate and
 * only pays on a body that leads somewhere. A region with no water gets
 * neither and costs one `waterBodies` call a turn to find that out.
 */
function openTheHarbour(state, deputy) {
  if (state.population < rules().deputy.harbourAtPopulation) return false;
  if (deputy.marinas < 1 && placeUtility(state, deputy, "marina")) {
    deputy.marinas += 1;
    return true;
  }
  if (deputy.terminals < 1 && placeUtility(state, deputy, "ferryTerminal")) {
    deputy.terminals += 1;
    // And a ROAD to it, the way the rail station gets one: a gate nobody can
    // drive to is dead, and three of thirty cities built exactly that before
    // this line existed.
    connectToNetwork(state, deputy, lastSpot, "road", CMD_PLACE_ROAD);
    return true;
  }
  return false;
}

function findSpotFor(state, deputy, defId) {
  var def = definition(defId);
  if (!def) return -1;
  // A rank the seat has not reached is the same answer as nowhere to put it
  // (T5, A69): the reducer would refuse the command, and a deputy that issues
  // a command it knows will be refused inflates its own refusal count and
  // spends a turn. Both of its building paths come through here.
  if (!isUnlocked(state, defId)) return -1;
  var reach = carrierReach(state, deputy);
  var bestIndex = -1;
  var bestScore = -1;
  for (var i = 0; i < state.width * state.height; i += 1) {
    var x = xOf(state.width, i);
    var y = yOf(state.width, i);
    if (x + def.w > state.width || y + def.h > state.height) continue;
    if (!footprintClear(state, deputy.seat, x, y, def)) continue;
    if (!hasReachableSide(state, deputy.seat, x, y, def, reach)) continue;
    if (def.needsSurfaceWater === true && !nearWater(state, x, y, def)) continue;
    // A harbour stands beside enough water to be one (T4), and a SEA gate
    // beside water that leads out of the region — the deputy will not build a
    // terminal on a lake, which is a thing a player may do and be told about.
    if (def.needsBody) {
      var body = bodyAt(state, bodies(state), x, y, def.w, def.h);
      if (!body || body.size < rules().harbour[def.needsBody]) continue;
      if (def.gate === "sea" && !body.edge) continue;
    }
    // Near the deputy's work, but not on top of it.
    var distance = Math.abs(x - deputy.cursorX) + Math.abs(y - deputy.cursorY);
    var score = 200 - Math.abs(distance - 8);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function footprintClear(state, seat, x, y, def) {
  for (var dy = 0; dy < def.h; dy += 1) {
    for (var dx = 0; dx < def.w; dx += 1) {
      var index = tileAt(state.width, x + dx, y + dy);
      if (!isBuildable(state.tiles.terrain[index])) return false;
      if (state.tiles.buildingId[index] !== 0) return false;
      if (state.tiles.zone[index] !== ZONE_NONE) return false;
      if (hasNet(state.tiles.road[index])) return false;
      var owner = state.tiles.owner[index];
      if (owner !== OWNER_NATURE && owner !== seat) return false;
    }
  }
  return true;
}

/** Every tile a carrier run could reach from the grid the deputy already has
 * (G2, A86): a flood out from every wire and pipe tile over the ground a run
 * may cross. `undefined` when there is no grid at all, which is the first
 * plant in a new city and must not be refused a spot.
 *
 * The walls are `connectToNetwork`'s walls, so the two agree: a lot the search
 * would arrive at is a lot this says yes to. */
function carrierReach(state, deputy) {
  var total = state.width * state.height;
  var reach = [];
  var queue = [];
  var i;
  for (i = 0; i < total; i += 1) reach.push(false);
  for (i = 0; i < total; i += 1) {
    if (!hasNet(state.tiles.wire[i]) && !hasNet(state.tiles.pipe[i])) continue;
    reach[i] = true;
    queue.push(i);
  }
  if (queue.length === 0) return undefined;
  for (var head = 0; head < queue.length; head += 1) {
    var index = queue[head];
    var x = xOf(state.width, index);
    var y = yOf(state.width, index);
    for (var d = 0; d < DIR4.length; d += 1) {
      var n = neighbour(state.width, state.height, x, y, DIR4[d]);
      if (n < 0 || reach[n]) continue;
      if (state.tiles.buildingId[n] !== 0) continue;
      var owner = state.tiles.owner[n];
      if (owner !== OWNER_NATURE && owner !== deputy.seat) continue;
      reach[n] = true;
      queue.push(n);
    }
  }
  return reach;
}

/** Is there one orthogonal side a carrier run could arrive at this lot from
 * (G2, A86)?
 *
 * Seed 404's deputy put two clinics inside a solid block of its own buildings:
 * every tile around them was a lot, so neither wire nor pipe could ever reach
 * them, and `connectToNetwork` issued nothing and said nothing. Seed 1111 then
 * showed the weaker version of the same mistake — a free side facing into a
 * pocket with no grid in it — which is why the side must be REACHABLE and not
 * merely empty. Diagonals do not count: the search walks the four neighbours.
 */
function hasReachableSide(state, seat, x, y, def, reach) {
  for (var dy = -1; dy <= def.h; dy += 1) {
    for (var dx = -1; dx <= def.w; dx += 1) {
      var insideX = dx >= 0 && dx < def.w;
      var insideY = dy >= 0 && dy < def.h;
      if (insideX === insideY) continue;
      var nx = x + dx;
      var ny = y + dy;
      if (!inBounds(state.width, state.height, nx, ny)) continue;
      var index = tileAt(state.width, nx, ny);
      if (state.tiles.buildingId[index] !== 0) continue;
      var owner = state.tiles.owner[index];
      if (owner !== OWNER_NATURE && owner !== seat) continue;
      if (reach && !reach[index]) continue;
      return true;
    }
  }
  return false;
}

function nearWater(state, x, y, def) {
  for (var dy = -1; dy <= def.h; dy += 1) {
    for (var dx = -1; dx <= def.w; dx += 1) {
      var nx = x + dx;
      var ny = y + dy;
      if (!inBounds(state.width, state.height, nx, ny)) continue;
      if (isWater(state.tiles.terrain[tileAt(state.width, nx, ny)])) return true;
    }
  }
  return false;
}

/** Where a carrier run begins: the tile asked for, and every other tile of the
 * same building. `lot` is 0 for a bare tile, which is then the only seed. */
function isLotTile(state, index, from, lot) {
  if (index === from) return true;
  return lot !== 0 && state.tiles.buildingId[index] === lot;
}

/** Joins a point to the nearest tile that already carries the network, by the
 * shortest clear route.
 *
 * Two earlier versions failed here and both failures are worth keeping in
 * mind. The first walked toward the hub and SKIPPED blocked cells, which left
 * a hole in the line and split the network. The second refused any route with
 * a building on it — which, in a city dense enough to matter, is every route:
 * pumps sat at the river with 1 connected pipe tile out of 1206 while the
 * whole city went thirsty. A breadth-first search around the obstacles is what
 * a person does with the tool, and it is what works.
 */
function connectToNetwork(state, deputy, from, layer, command, flag) {
  var total = state.width * state.height;
  var seen = [];
  var cameFrom = [];
  var i;
  for (i = 0; i < total; i += 1) {
    seen.push(false);
    cameFrom.push(-1);
  }

  // The search starts at the WHOLE lot, not at its top-left tile (G2, A86).
  // A 2x2 station's corner tile has two tiles of the station itself as
  // neighbours, and both are walls to this search — so a station with a
  // building on each of the other two sides had nowhere to go at all. Seed
  // 1003 had one: a fire station with no wire, no pipe and no refusal, because
  // the search returned without issuing anything.
  var lot = state.tiles.buildingId[from];
  var queue = [];
  for (i = 0; i < total; i += 1) {
    if (!isLotTile(state, i, from, lot)) continue;
    seen[i] = true;
    queue.push(i);
  }
  var head = 0;
  var target = -1;
  var fallback = -1;

  while (head < queue.length && head < 6000) {
    var index = queue[head];
    head += 1;
    // Already on the grid? Then this is where the new run should meet it.
    //
    // `flag` asks for a LIVE piece of grid — one the supply pass has marked
    // satisfied — rather than the nearest carrier of any kind. The deputy's
    // wire was not one network: on seed 1003 at year nine it was twelve
    // components, seven of them with no producer on them at all, and joining
    // the nearest one connected the rail station to a dead stub sixteen units
    // deep in demand and zero in capacity. T2 asked for it for the station
    // alone; since G2 every building the deputy connects asks for it, and over
    // 200 games a configuration the grid is one component (era 14).
    if (!isLotTile(state, index, from, lot) && hasNet(state.tiles[layer][index])) {
      if (!flag || (state.tiles.flags[index] & flag) !== 0) {
        target = index;
        break;
      }
      if (fallback < 0) fallback = index;
    }
    var x = xOf(state.width, index);
    var y = yOf(state.width, index);
    for (var d = 0; d < DIR4.length; d += 1) {
      var n = neighbour(state.width, state.height, x, y, DIR4[d]);
      if (n < 0 || seen[n]) continue;
      // Buildings and other people's land are walls.
      if (state.tiles.buildingId[n] !== 0 && !hasNet(state.tiles[layer][n])) continue;
      var owner = state.tiles.owner[n];
      if (owner !== OWNER_NATURE && owner !== deputy.seat) continue;
      seen[n] = true;
      cameFrom[n] = index;
      queue.push(n);
    }
  }
  // A dead stub is better than nothing: the grid may have no live piece yet.
  if (target < 0) target = fallback;
  if (target < 0) {
    deputy.unconnected += 1;
    return false;
  }

  var cells = [];
  var walk = target;
  while (walk >= 0 && !isLotTile(state, walk, from, lot)) {
    if (!hasNet(state.tiles[layer][walk])) cells.push(walk);
    walk = cameFrom[walk];
  }
  // Whether anything was actually LAID, which is not the same as "a target was
  // found": the route may already be carrier all the way, and a caller that
  // treats that as work done spends every turn on it (H5).
  if (cells.length === 0) return false;
  issue(state, deputy, { type: command, actor: deputy.seat, runs: encodeRuns(cells) });
  if (command === CMD_PLACE_ROAD) dezoneUnder(state, deputy, cells);
  return true;
}

/** To a LIVE piece of grid, for every building (G2, A86, Q117).
 *
 * This asked for the nearest carrier of any kind until now, and the deputy's
 * wire is not one network: on seed 1003 at year nine it was twelve components,
 * seven of them with no producer on them at all, so a new plant was joined to a
 * dead stub and ten buildings of 119 had wire and no power. T2 fixed it for the
 * rail station alone, because a station is the first building whose "am I
 * powered" question anything asks out loud.
 *
 * `connectToNetwork` falls back to any carrier when no live one is in reach, so
 * a city's FIRST plant still joins what there is.
 */
function connectToHub(state, deputy, from) {
  connectToNetwork(state, deputy, from, "wire", CMD_PLACE_WIRE, FLAG_POWERED);
  connectToNetwork(state, deputy, from, "pipe", CMD_PLACE_PIPE, FLAG_WATERED);
}

/** One turn of the deputy. Called on a cadence by the driver, not by the
 * reducer: a deputy is a player, and players act between ticks. */
/**
 * Spans the narrowest water between the town and ground it cannot otherwise
 * reach (Q143, A121) — the first deputy rule whose purpose is to reach land it
 * does not own.
 *
 * S13 taught `buildBlockAlong` to cross a river its block happens to meet, and
 * measured what that is worth: in a twenty-year played 96 the deputy meets water
 * fifteen times and a building on the far bank refused all five attempts, so it
 * built no bridge at all. Everything else structural the deputy owns is sought
 * on purpose — a line past `railAtPopulation`, a harbour past
 * `harbourAtPopulation` — and a crossing is the one that opens land rather than
 * serving land already taken.
 *
 * The scan is over the town's OWN tiles, not the map: `townReach` has already
 * flooded them, and a crossing starts on ground the town can reach. From each
 * such tile the four directions are walked up to `build.bridgeSpan` tiles of
 * water; a candidate is one that lands on buildable ground with room on the far
 * side, and the best is the shortest span with the most free land beyond it.
 */
function openTheCrossing(state, deputy, town) {
  if (deputy.bridges >= rules().deputy.bridgeCap) return false;
  if (state.population < rules().deputy.bridgeAtPopulation) return false;

  var span = rules().build.bridgeSpan;
  var seat = deputy.seat;
  var width = state.width;
  var height = state.height;
  var best = -1;
  var bestRun = undefined;
  var i;
  var d;
  for (i = 0; i < town.lots; i += 1) {
    var from = town.queue[i];
    var fx = xOf(width, from);
    var fy = yOf(width, from);
    for (d = 0; d < 4; d += 1) {
      var dx = DIR4[d].dx;
      var dy = DIR4[d].dy;
      // The bank: the last dry tile before the water, two tiles back so the
      // run has an approach on this side.
      var ax = fx - dx * 2;
      var ay = fy - dy * 2;
      if (!inBounds(width, height, ax, ay)) continue;
      var run = [];
      var ok = true;
      var k;
      for (k = 0; k < 3 && ok; k += 1) {
        var bx = ax + dx * k;
        var by = ay + dy * k;
        var bi = tileAt(width, bx, by);
        if (isWater(state.tiles.terrain[bi])) { ok = false; break; }
        if (!free(state, bi, seat)) { ok = false; break; }
        run.push(bi);
      }
      if (!ok || run.length < 3) continue;
      // Then the water, up to the span.
      var wet = 0;
      var wx = fx + dx;
      var wy = fy + dy;
      while (wet <= span && inBounds(width, height, wx, wy)
        && isWater(state.tiles.terrain[tileAt(width, wx, wy)])) {
        run.push(tileAt(width, wx, wy));
        wet += 1;
        wx += dx;
        wy += dy;
      }
      if (wet === 0 || wet > span) continue;
      // And the far bank, three tiles of it, all of them ours to build on.
      var landed = 0;
      while (landed < 3 && inBounds(width, height, wx, wy)) {
        var fi = tileAt(width, wx, wy);
        if (isWater(state.tiles.terrain[fi]) || !free(state, fi, seat)) break;
        run.push(fi);
        landed += 1;
        wx += dx;
        wy += dy;
      }
      if (landed < 3) continue;
      // What the far side is WORTH: buildable ground within the deputy's reach
      // of where the bridge lands. A crossing onto a rock is a crossing to
      // nowhere, and this rule exists to open land.
      var room = roomAround(state, wx - dx, wy - dy, seat);
      if (room < rules().deputy.bridgeNeedsRoom) continue;
      var score = room * 100 - wet;
      if (score > best) { best = score; bestRun = run; }
    }
  }
  if (!bestRun) return false;
  var laid = issue(state, deputy, {
    type: CMD_PLACE_ROAD, actor: seat, runs: encodeRuns(bestRun),
  });
  if (laid.result !== RESULT.OK) {
    deputy.refusals += 1;
    return false;
  }
  deputy.bridges += 1;
  dezoneUnder(state, deputy, bestRun);
  return true;
}

/** Is this tile ours to pave: buildable, unbuilt, unpaved and not somebody
 * else's? */
function free(state, index, seat) {
  if (!isBuildable(state.tiles.terrain[index])) return false;
  if (state.tiles.buildingId[index] !== 0) return false;
  if (hasNet(state.tiles.road[index])) return false;
  var owner = state.tiles.owner[index];
  return owner === OWNER_NATURE || owner === seat;
}

/** How much free ground there is around a tile, within the deputy's reach. */
function roomAround(state, x, y, seat) {
  var reach = rules().deputy.bridgeRoomReach;
  var n = 0;
  var dy;
  var dx;
  for (dy = -reach; dy <= reach; dy += 1) {
    for (dx = -reach; dx <= reach; dx += 1) {
      var nx = x + dx;
      var ny = y + dy;
      if (!inBounds(state.width, state.height, nx, ny)) continue;
      var i = tileAt(state.width, nx, ny);
      if (free(state, i, seat) && state.tiles.zone[i] === ZONE_NONE) n += 1;
    }
  }
  return n;
}

export function deputyTurn(state, deputy, sink) {
  deputy.sink = sink;
  deputy.rolls = 0;
  if (deputy.doctrine === DOCTRINE_HOLD) return false;

  var funds = treasuryOf(state, deputy.seat);
  // Keep a reserve so a deputy never bankrupts a city it was left in charge
  // of. Doctrine decides how deep it will dig.
  var reserve = deputy.doctrine === DOCTRINE_BALANCE ? 4000 : 800;
  if (funds < reserve) return false;

  if (deputy.cursorX < 0) {
    var start = findStart(state, deputy.seat);
    if (start < 0) return false;
    deputy.cursorX = xOf(state.width, start);
    deputy.cursorY = yOf(state.width, start);
  }

  // Supply first, expansion second — but only after the cursor exists, since
  // the carrier line is run toward it.
  if (keepSupplied(state, deputy)) return true;
  // Then anything the city has capacity for and cannot reach: a disaster cuts a
  // line and the component behind it is dark until somebody joins it back up
  // (H5, A96). Before expansion, because a dark block is a block that is already
  // built and already paid for.
  if (repairGrid(state, deputy)) return true;
  // Then the fire service, before more streets: a block that burns down is
  // worth more than a block that was never built (B1a).
  if (keepCovered(state, deputy)) return true;
  // Then the school and the square (T6): coverage a city is judged on rather
  // than coverage that keeps it from burning, and the deputy is the mayor in
  // every headless game — a sweep played without them measures a town that
  // reads zero on two of the five layers.
  if (keepAmused(state, deputy)) return true;
  // And the cheap rows (T7): a clinic, the two headquarters and somewhere for
  // the rubbish, each on a threshold the city already computes.
  if (keepTidy(state, deputy)) return true;
  // And once the town is big enough, its busiest street becomes its main road.
  if (upgradeTrunk(state, deputy)) return true;
  // Then the railway, which is a bigger town still (T2).
  if (openTheLine(state, deputy)) return true;
  // And the water, if the region has any worth a harbour (T4).
  if (openTheHarbour(state, deputy)) return true;

  // Stop expanding when a deficit is actually running the treasury down —
  // not merely because the books are negative. A new city runs a deficit by
  // design: the plant and the streets are paid for before anyone moves in.
  // Blocking on net alone deadlocked four cities out of five, permanently:
  // no expansion, no residents, no income, no expansion.
  if (funds < 6000 && budgetFor(state, deputy.seat).net < 0) return false;

  var town = townReach(state, deputy.seat, reachOf(deputy));
  // Burnt ground before new ground: a plot that already has streets and
  // services beside it is the cheapest place in the city to build (B1a).
  if (clearRuins(state, deputy, town)) return true;
  // And the far bank, once the town is big enough to want one (Q143, A121).
  // After the ruins and before the next block: a crossing is an expansion
  // decision, and it competes with laying another street on this side.
  if (openTheCrossing(state, deputy, town)) return true;

  var attempts = 0;
  while (attempts < 6) {
    if (buildBlock(state, deputy, town)) return true;
    // Blocked: hop somewhere else rather than grinding against the same rock —
    // near the town when there is one (B9): a hop to anywhere on the map is a
    // hop the reach rule refuses, and six of them are a turn wasted.
    if (town.fringeCount > 0) {
      var spot = town.fringe[roll(state, deputy, town.fringeCount)];
      deputy.cursorX = clamp(xOf(state.width, spot), 1, state.width - 2);
      deputy.cursorY = clamp(yOf(state.width, spot), 1, state.height - 2);
    } else if (town.lots > 0) {
      var reach = reachOf(deputy);
      var lot = town.queue[roll(state, deputy, town.lots)];
      deputy.cursorX = clamp(xOf(state.width, lot) + roll(state, deputy, reach * 2 + 1) - reach, 1, state.width - 2);
      deputy.cursorY = clamp(yOf(state.width, lot) + roll(state, deputy, reach * 2 + 1) - reach, 1, state.height - 2);
    } else {
      deputy.cursorX = 1 + roll(state, deputy, state.width - 2);
      deputy.cursorY = 1 + roll(state, deputy, state.height - 2);
    }
    attempts += 1;
  }
  return false;
}

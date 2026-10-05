// The deputy lays roads near the town (slice B9, A81).
//
// The deputy is the AI mayor every headless gate plays with. It laid a street
// wherever its cursor wandered — a grid of empty roads across the river on the
// played city, which is D4's "the town has no edge" and the reason S2's fields
// had nowhere to be. A81: a road may be laid only within `roadReach` tiles of a
// lot that is built, or zoned and supplied; the grid grows outward with the
// town instead of ahead of it. Nothing is ever unpaved.

import test from "node:test";
import assert from "node:assert/strict";
import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { makeDeputy, deputyTurn, deputyRoll } from "../engine/deputy.js";
import { nextInt } from "../shared/prng.js";
import { CMD_JOIN, CMD_TICK } from "../engine/commands.js";
import { TICKS_PER_YEAR, TICKS_PER_MONTH, ZONE_NONE, ZONE_RESIDENTIAL, FLAG_RUINED, TERRAIN_WATER, TERRAIN_SHALLOW } from "../engine/constants.js";
import { rules, setRules } from "../engine/rules.js";
import { gateStatus, gateTerms, railReach } from "../engine/gates.js";
import { waterBodies, bodyAt } from "../engine/terrain.js";
import { isAvenue, hasNet, NET_PRESENT } from "../engine/network.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/disasters.js";
import "../engine/traffic.js";
import "../engine/history.js";
import "../engine/requests.js";

function play(seed, size, years, doctrine = "expand", over = {}) {
  const world = generateWorld(defaultOptions({ seed, width: size, height: size, seats: 1, waterStyle: "river", ...over }));
  assert.ok(world.ok, `seed ${seed} did not generate`);
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Deputy" });
  const deputy = makeDeputy(1, doctrine);
  for (let tick = 1; tick <= years * TICKS_PER_YEAR; tick += 1) {
    apply(state, { type: CMD_TICK });
    if (tick % 6 === 0) deputyTurn(state, deputy);
  }
  return { state, deputy };
}

/** Steps from every tile to the nearest lot that is built or zoned, over the
 * four neighbours. At the END of a run: the rule asks for SUPPLIED zoning when
 * a road is laid, and a zone can lose its power or water long after — measured
 * against supply at the end, fifty roads on one seed looked stranded that were
 * laid by the rule. A road beyond reach of any zone or building is ahead of the
 * town, whatever happened since. */
function reachFromLots(state) {
  const { width: w, height: h } = state;
  const dist = new Int32Array(w * h).fill(-1);
  const queue = [];
  for (let i = 0; i < w * h; i += 1) {
    if (state.tiles.buildingId[i] !== 0 || state.tiles.zone[i] !== ZONE_NONE) { dist[i] = 0; queue.push(i); }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const i = queue[head];
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (dist[j] >= 0) continue;
      dist[j] = dist[i] + 1;
      queue.push(j);
    }
  }
  return dist;
}

const roadTiles = (state) => {
  const out = [];
  for (let i = 0; i < state.tiles.road.length; i += 1) if ((state.tiles.road[i] & 16) !== 0) out.push(i);
  return out;
};

test("the reach is data, and expand reaches a little further than the doctrines that hold back", () => {
  const reach = rules().deputy.roadReach;
  assert.equal(reach.balance, 3, "A81 starts at 3");
  assert.ok(reach.expand > reach.balance, "expand does not reach further than balance");
  assert.ok(reach.green >= 1);
});

test("no road the deputy lays is further than its reach from a lot that is built, or zoned and supplied", () => {
  // A road beyond reach is a street ahead of the town. Measured at the end of
  // the run, against the town as it stands then — a lot that burned down after
  // its road was laid could leave one stranded, and none should be further
  // than a couple of tiles past the rule.
  const reach = rules().deputy.roadReach.expand;
  for (const seed of [1003, 2026, 77]) {
    const { state } = play(seed, 48, 10);
    const dist = reachFromLots(state);
    const roads = roadTiles(state);
    assert.ok(roads.length > 20, `seed ${seed}: the deputy built ${roads.length} road tiles in ten years`);
    const far = roads.filter((i) => dist[i] < 0 || dist[i] > reach + 2);
    assert.equal(far.length, 0, `seed ${seed}: ${far.length} of ${roads.length} road tiles are beyond reach of the town`);
  }
});

test("a new city still starts: the first street needs no lot to be near", () => {
  // Before anything is zoned nothing qualifies, and a rule with no exception
  // for the first street is a deputy that never lays one.
  const { state } = play(1003, 48, 2);
  assert.ok(roadTiles(state).length > 0, "no road in two years");
  assert.ok(state.buildings.length > 0, "nothing built in two years");
});

test("a city still grows", () => {
  // Eight seeds and a MEDIAN, not three seeds and a floor on each.
  //
  // The floor version was three hand-picked seeds over 150 residents, which is
  // exactly what CLAUDE.md says not to tune on — and Q113's fix moved the
  // deputy's rolls, so seed 77 landed on a map where it reaches 112 in twelve
  // years while the other seven reach 1,400 to 2,352. One stuck city in eight
  // is inside the distribution the sweep already measures ("living cities: 200
  // of 200", "ended empty: 0"); a three-seed floor could not tell that from a
  // deputy that had stopped working.
  const counts = [1003, 2026, 77, 5, 41, 119, 640, 7].map((seed) => {
    const { state } = play(seed, 48, 12);
    let residents = 0;
    for (const b of state.buildings) if (b.zone === ZONE_RESIDENTIAL) residents += b.occupancy;
    return residents;
  }).sort((a, b) => a - b);

  const median = counts[counts.length >> 1];
  assert.ok(median > 800, `the median city has ${median} residents after twelve years: ${counts.join(", ")}`);
  assert.ok(counts.filter((n) => n > 150).length >= 6,
    `${counts.filter((n) => n <= 150).length} of eight cities never got going: ${counts.join(", ")}`);
});

test("the deputy clears burnt ground inside its town, and zones it again", () => {
  // Nothing in a headless city had ever cleared a ruin — `clearRuin` has no
  // caller and bulldozing is the player's command — which cost nothing while a
  // fire took one house. With B1a's fire it is dead ground that development
  // skips forever: 36 tiles per city by year 25, before this.
  const { state, deputy } = play(1003, 48, 8);
  const ruined = [];
  // Burn a row of the town's own lots.
  for (let i = 0; i < state.tiles.flags.length; i += 1) {
    if (state.tiles.zone[i] === ZONE_NONE) continue;
    if (state.tiles.owner[i] !== 1) continue;
    state.tiles.buildingId[i] = 0;
    state.tiles.flags[i] |= FLAG_RUINED;
    ruined.push(i);
    if (ruined.length === 6) break;
  }
  assert.equal(ruined.length, 6, "the deputy's town has no zoned ground to burn");
  const zonesBefore = ruined.map((i) => state.tiles.zone[i]);

  for (let turn = 0; turn < 6; turn += 1) deputyTurn(state, deputy);

  const left = ruined.filter((i) => (state.tiles.flags[i] & FLAG_RUINED) !== 0);
  assert.equal(left.length, 0, `${left.length} of 6 burnt tiles are still ruins`);
  const rezoned = ruined.filter((i, k) => state.tiles.zone[i] === zonesBefore[k]);
  assert.ok(rezoned.length >= 5, `only ${rezoned.length} of 6 cleared tiles were zoned again`);
});

test("a town below the size has no avenue, and a grown city's is where the traffic is", () => {
  // T1a (A60): "the deputy lays an avenue for its first trunk road once the
  // city passes a size" — and a TRUNK road is the street the traffic is already
  // on. The first cut laid the avenue as the next block, which lands on fresh
  // ground at the edge of town by B9's fringe rule: measured on four played
  // cities, those avenues carried a mean load of exactly zero.
  const tiles = (state) => {
    const out = [];
    for (let i = 0; i < state.tiles.road.length; i += 1) if (isAvenue(state.tiles.road[i])) out.push(i);
    return out;
  };

  const small = play(1003, 48, 1).state;
  assert.ok(small.population < rules().deputy.avenueAtPopulation,
    `the town reached ${small.population} in two years, which is already avenue size`);
  assert.equal(tiles(small).length, 0, "a town below the size has a main road");

  // Played until the upgrade fires, and measured THEN: the deputy picks the
  // busiest street once, and a city that keeps growing moves its centre — at
  // year eight this same avenue carries 12.8 against the streets' 13.8, which
  // is the rule working and the city having moved on, not the rule failing.
  const { state: grown, deputy } = play(1003, 48, 2);
  for (let turn = 0; turn < 400 && tiles(grown).length === 0; turn += 1) {
    apply(grown, { type: CMD_TICK });
    if (turn % 6 === 0) deputyTurn(grown, deputy);
  }
  assert.ok(grown.population >= rules().deputy.avenueAtPopulation,
    `the city only reached ${grown.population}`);
  const avenue = tiles(grown);
  assert.ok(avenue.length >= 4, `${avenue.length} avenue tiles in a city of ${grown.population}`);
  assert.ok(avenue.length <= 2 * rules().deputy.avenueTiles + 1,
    `${avenue.length} avenue tiles is a network, not a trunk road`);

  // And it is a trunk road: busier than the average street.
  let avenueLoad = 0;
  let roadLoad = 0;
  let roads = 0;
  for (let i = 0; i < grown.tiles.road.length; i += 1) {
    if ((grown.tiles.road[i] & NET_PRESENT) === 0) continue;
    if (isAvenue(grown.tiles.road[i])) avenueLoad += grown.tiles.traffic[i];
    else { roadLoad += grown.tiles.traffic[i]; roads += 1; }
  }
  assert.ok(avenueLoad / avenue.length > roadLoad / Math.max(1, roads),
    `the avenue carries ${(avenueLoad / avenue.length).toFixed(1)} against the streets' ${(roadLoad / roads).toFixed(1)}`);
});

test("the deputy opens a line to the edge, and the station it puts on it is LIVE", () => {
  // T2. A station that is built, standing, costing upkeep and dead is a thing
  // a player can do and the deputy should not — so the rail goes down first
  // (`needsRail`), and the wire, the pipe and a road follow it.
  const { state, deputy } = play(1003, 48, 2);
  for (let turn = 0; turn < 600 && deputy.stations === 0; turn += 1) {
    apply(state, { type: CMD_TICK });
    if (turn % 6 === 0) deputyTurn(state, deputy);
  }
  assert.equal(deputy.stations, 1, `no station in a city of ${state.population}`);
  assert.ok(state.population >= rules().deputy.railAtPopulation,
    `the city only reached ${state.population}`);

  const station = state.buildings.find((b) => b.def === "railStation");
  assert.ok(station, "the deputy counted a station it did not build");
  // A year for the supply pass to reach it: the flags are set by the monthly
  // tick, not by the command that laid the wire, so a station is dead for a
  // month after it is built however well it was connected.
  for (let tick = 0; tick < 12; tick += 1) apply(state, { type: CMD_TICK });
  const status = gateStatus(state, station);
  assert.equal(status.live, true, `the deputy's own station is dead: ${status.reason}`);

  // The line reaches an edge, which is what `live` means, and it is a LINE —
  // a straight run, not a network.
  const reach = railReach(state);
  let laid = 0;
  let joined = 0;
  for (let i = 0; i < state.tiles.rail.length; i += 1) {
    if ((state.tiles.rail[i] & NET_PRESENT) === 0) continue;
    laid += 1;
    if (reach[i] === 1) joined += 1;
  }
  assert.ok(laid > 0, "a live station with no rail under it");
  assert.equal(joined, laid, `${laid - joined} rail tiles of ${laid} do not reach an edge`);

  // And it is worth something: the Outside's terms are in the pool.
  assert.deepEqual(gateTerms(state), {
    residential: rules().gate.rail.residential,
    commercial: rules().gate.rail.commercial,
    industrial: rules().gate.rail.industrial,
  });
});

test("a doctrine that holds the line never opens one", () => {
  // `hold` builds nothing at all, which is the whole doctrine; this is the
  // assertion that says the new row obeys it rather than reaching past it.
  const { state } = play(1003, 48, 2);
  // The DELTA, not the count. The two years of `expand` that set this fixture
  // up are free to build whatever they like, and T7 made cities grow fast
  // enough that they reach `railAtPopulation` inside them — at which point an
  // assertion of "zero stations" is about the setup rather than the doctrine.
  // Lots that GREW are the development pass, not the deputy, so only the
  // unzoned ones count on either side.
  const civic = (s) => s.buildings.filter((b) => b.zone === 0).length;
  const before = civic(state);
  const stationsBefore = state.buildings.filter((b) => b.def === "railStation").length;
  const holding = makeDeputy(1, "hold");
  for (let turn = 0; turn < 600; turn += 1) {
    apply(state, { type: CMD_TICK });
    if (turn % 6 === 0) deputyTurn(state, holding);
  }
  assert.equal(holding.stations, 0);
  assert.equal(state.buildings.filter((b) => b.def === "railStation").length, stationsBefore,
    "the holding deputy opened a line");
  // And nothing else either, which is the doctrine.
  assert.equal(civic(state), before,
    `the holding deputy built ${civic(state) - before} things`);
});

test("the deputy builds a marina on a big body, and a terminal only on one that reaches the edge", () => {
  // T4. `waterStyle: "river"` cuts the map in two, so the body reaches two
  // edges and both buildings are on: the marina for the water itself, the
  // terminal because that water leads out of the region.
  const { state, deputy } = play(1003, 48, 2);
  for (let turn = 0; turn < 900 && deputy.terminals === 0; turn += 1) {
    apply(state, { type: CMD_TICK });
    if (turn % 6 === 0) deputyTurn(state, deputy);
  }
  assert.ok(state.population >= rules().deputy.harbourAtPopulation,
    `the city only reached ${state.population}`);
  assert.equal(deputy.marinas, 1, "no marina on a river map");
  assert.equal(deputy.terminals, 1, "no ferry terminal on a river map");

  // Both stand on the water they need, and the terminal is LIVE — a deputy
  // that builds a dead gate is the defect T2 found and fixed for the station.
  for (let tick = 0; tick < 12; tick += 1) apply(state, { type: CMD_TICK });
  const bodies = waterBodies(state);
  for (const def of ["marina", "ferryTerminal"]) {
    const b = state.buildings.find((x) => x.def === def);
    assert.ok(b, `the deputy counted a ${def} it did not build`);
    const body = bodyAt(state, bodies, b.x, b.y, b.w, b.h);
    assert.ok(body && body.size >= rules().harbour.marinaMinBody,
      `${def} stands beside ${body ? body.size : 0} tiles of water`);
  }
  const terminal = state.buildings.find((x) => x.def === "ferryTerminal");
  const status = gateStatus(state, terminal);
  assert.equal(status.live, true, `the deputy's own terminal is dead: ${status.reason}`);
});

test("a region with no water gets no harbour, and the turn is not wasted looking", () => {
  const { state, deputy } = play(1003, 48, 2, "expand", { waterStyle: "none" });
  for (let turn = 0; turn < 600; turn += 1) {
    apply(state, { type: CMD_TICK });
    if (turn % 6 === 0) deputyTurn(state, deputy);
  }
  assert.equal(deputy.marinas, 0);
  assert.equal(deputy.terminals, 0);
  assert.ok(state.population > 0, "the dry city did not grow, so this proves nothing");
});

// --- the deputy's own stream (A82) -------------------------------------------

test("a deputy roll does not depend on how far the world's PRNG has run", () => {
  // The invariant A82 bought, asserted directly. Before it the deputy drew
  // from `state.rng` — the stream `development.js`, `fire.js` and
  // `disasters.js` draw from — so one extra deputy action shifted every later
  // fire and every later growth roll, and "the avenue" and "skip a turn and
  // issue nothing" produced numbers identical to the last digit.
  const world = generateWorld(defaultOptions({ seed: 1003, width: 32, height: 32, seats: 1 }));
  const state = world.state;
  const deputy = makeDeputy(1, "expand");

  const first = [];
  deputy.rolls = 0;
  for (let k = 0; k < 8; k += 1) first.push(deputyRoll(state, deputy, 1000));

  // Everything else in the simulation draws a hundred times.
  for (let k = 0; k < 100; k += 1) nextInt(state.rng, 1000);

  const again = [];
  deputy.rolls = 0;
  for (let k = 0; k < 8; k += 1) again.push(deputyRoll(state, deputy, 1000));
  assert.deepEqual(again, first, "the deputy's rolls moved because the world's PRNG did");

  // And it is not a constant: the tick, the seat and the index each move it.
  state.tick += 1;
  deputy.rolls = 0;
  assert.notDeepEqual([deputyRoll(state, deputy, 1000)], [first[0]], "a new tick rolls the same number");
  state.tick -= 1;
  const other = makeDeputy(2, "expand");
  assert.notEqual(deputyRoll(state, other, 1000), first[0], "a second seat rolls the same number");
  assert.notEqual(first[0], first[1], "two draws in one turn are the same number");
});

test("the deputy's draws do not move the world's PRNG", () => {
  // The other half: a deputy that thinks harder must not change the weather.
  const world = generateWorld(defaultOptions({ seed: 7, width: 32, height: 32, seats: 1 }));
  const state = world.state;
  const deputy = makeDeputy(1, "expand");
  const before = state.rng.s;
  assert.equal(typeof before, "number", "the world's PRNG does not keep its state in `s` any more");
  for (let k = 0; k < 50; k += 1) deputyRoll(state, deputy, 97);
  assert.equal(state.rng.s, before, "fifty deputy draws advanced the world's stream");
  // And the check can see one: a single world draw moves it.
  nextInt(state.rng, 97);
  assert.notEqual(state.rng.s, before, "the world's stream did not move when the world drew");
});

// --- the carriers reach a LIVE grid (slice G2; A86, Q117) ---------------------

test("every building the deputy builds ends up on a live grid", () => {
  // Q117, measured at T2 and left for its own slice. `connectToNetwork` ran to
  // the NEAREST carrier tile, which is usually an isolated stub the deputy laid
  // earlier, and the same seeds under the code this replaces read:
  //
  //   seed 1003  8 components, 7 of 346 dark, 1400 capacity against 1366 demand
  //   seed  404  8 components, 228 of 439 dark on WATER, 1200 against 997
  //   seed  707  8 components, 14 of 352 dark, 2800 against 1509
  //
  // Every one of those cities held more capacity than it had demand. Three
  // seeds because three separate defects were in here and no single city shows
  // all of them: a lot sealed by its own footprint (1003's fire station, whose
  // corner tile had two of its own tiles as neighbours), a lot sealed by its
  // neighbours (404's two clinics, inside a solid block of buildings), and the
  // dead-stub join itself (all of them).
  for (const seed of [1003, 404, 707]) {
    const { state, deputy } = play(seed, 64, 20);
    assert.ok(state.buildings.length > 40,
      `seed ${seed} built only ${state.buildings.length} buildings, so it proves nothing`);

    // 1. Every carrier run reached something. This counter is the instrument:
    //    a run that finds no route issues no command and earns no refusal, so
    //    without it the failure is invisible from outside the deputy.
    assert.equal(deputy.unconnected, 0,
      `seed ${seed}: ${deputy.unconnected} carrier runs reached nothing at all`);

    // 2. The city is one grid, not a field of stubs. A disaster can still cut
    //    one in two — that is the game working, and it is why this is not "one".
    assert.ok(state.supply.power.components <= 2,
      `seed ${seed}: the power grid is ${state.supply.power.components} components`);

    // 3. And the grid they reached is live. Asserted through `state.supply` —
    //    the engine's own answer to "is this city supplied" — rather than a
    //    count of wire tiles: a deputy that laid more carrier to the same dead
    //    stub passes that and fails this. A city genuinely short of capacity
    //    browns out by design, so the assertion is conditional, and the message
    //    carries the figures that say which case it was.
    for (const kind of ["power", "water"]) {
      const supply = state.supply[kind];
      if (supply.demand > supply.capacity) continue;
      assert.equal(supply.starved, 0,
        `seed ${seed} ${kind}: ${supply.starved} of ${supply.served + supply.starved} buildings dark `
        + `across ${supply.components} components, with ${supply.capacity} capacity `
        + `against ${supply.demand} demand`);
    }
  }
});

// --- the deputy dezones what it paves (slice H4; A97, Q131) ------------------

test("no tile ends up carrying both a road and a zone", () => {
  // Q131, measured: **639 of 1,646 zoned tiles a city — 39% — carried a road.**
  // The deputy zones the strips beside a new street and then lays later streets
  // across its own zoned land, deliberately: B9's comment records that refusing
  // to cross a zoned strip cut the sweep's population by half, because crossing
  // one is how blocks join.
  //
  // Before G1 those tiles grew houses on the carriageway. Since G1 they cannot
  // develop at all, so they are zoning that was paid for and can never be used —
  // and the zoning overlay shows a city two fifths of which will never build.
  // The deputy dezones what it paves; crossing stays legal.
  for (const seed of [1003, 404]) {
    const { state } = play(seed, 64, 20);
    let zoned = 0;
    let paved = 0;
    for (let i = 0; i < state.width * state.height; i += 1) {
      if (state.tiles.zone[i] === ZONE_NONE) continue;
      zoned += 1;
      if (hasNet(state.tiles.road[i])) paved += 1;
    }
    assert.ok(zoned > 200, `seed ${seed} zoned only ${zoned} tiles, so this proves nothing`);
    assert.equal(paved, 0, `seed ${seed}: ${paved} of ${zoned} zoned tiles carry a road`);
  }
});

// --- the deputy repairs a grid a disaster cut in two (slice H5; A96, Q130) ---

test("a grid cut in two is repaired, and the dark buildings come back", () => {
  // G2 made every carrier RUN reach a live piece of grid and left Q130 open: a
  // disaster cuts a line, the component behind it loses its producer, and the
  // deputy — which connects a building when it BUILDS it and never looks again
  // — never notices. What repair there was came incidentally, from G2's rule
  // running a NEW building's carriers to a live piece.
  //
  // Measured before the rule, cutting every wire in one column of a 15-year
  // city: seed 1003 darkened 84 buildings of 234 and had **54 still dark a year
  // later**; seed 404 darkened 80 and had 11 after a year and **six after five**.
  //
  // The cut is made here rather than waited for, so this is a test of the
  // REPAIR rather than of a disaster's luck.
  let darkened = 0;
  let remaining = 0;
  for (const seed of [1003, 404]) {
    const { state, deputy } = play(seed, 64, 15);
    assert.ok(state.supply.power.capacity > state.supply.power.demand,
      `seed ${seed} has no spare capacity, so a dark building is a shortfall rather than a cut`);

    const cutX = Math.round(state.width / 2);
    let cut = 0;
    for (let y = 0; y < state.height; y += 1) {
      const index = y * state.width + cutX;
      if (!hasNet(state.tiles.wire[index])) continue;
      state.tiles.wire[index] = 0;
      cut += 1;
    }
    assert.ok(cut > 0, `seed ${seed} had no wire to cut`);

    // One month, so the supply pass sees the cut.
    for (let tick = 0; tick < TICKS_PER_MONTH; tick += 1) apply(state, { type: CMD_TICK });
    const dark = state.supply.power.starved;
    assert.ok(dark > 0, `seed ${seed}: cutting ${cut} wire tiles darkened nothing`);

    // Then a year of the deputy's turns. One repair a turn, so a shattered grid
    // comes back over months rather than in an afternoon.
    for (let tick = 1; tick <= TICKS_PER_YEAR; tick += 1) {
      apply(state, { type: CMD_TICK });
      if (tick % 6 === 0) deputyTurn(state, deputy);
    }
    darkened += dark;
    remaining += state.supply.power.starved;
  }

  // Across both seeds, because one city can always hold a building nothing can
  // reach — seed 404 keeps one, in a pocket later development closed. The rule
  // is "the grid comes back", not "every building is always reachable".
  assert.ok(remaining * 10 < darkened,
    `${darkened} buildings went dark and ${remaining} were still dark a year later `
    + `(the code this replaces left 65 of 164)`);
});


test("the deputy goes looking for a crossing, and only where the far bank is worth it (Q143, A121)", () => {
  // S13 taught `buildBlockAlong` to span a river its block happens to meet, and
  // measured what that is worth: in a twenty-year played 96 the deputy meets
  // water fifteen times and a building on the far bank refused all five
  // attempts, so it built none. This is the rule that goes and looks.
  //
  // Seed 202 is the city the era's arm measured: 1,483 residents without the
  // rule and 2,202 with it, because its town is hemmed in by water. One seed
  // and two arms, which is the shape that can SEE a rule that fires in two
  // cities of twelve — a sweep over all of them reads flat (A121).
  const base = rules();
  const withRules = (over) => {
    setRules({ ...base, deputy: { ...base.deputy, ...over } });
    try {
      const { state, deputy } = play(202, 64, 25);
      let wet = 0;
      for (let i = 0; i < state.tiles.road.length; i += 1) {
        const t = state.tiles.terrain[i];
        if ((t === TERRAIN_WATER || t === TERRAIN_SHALLOW) && (state.tiles.road[i] & NET_PRESENT) !== 0) wet += 1;
      }
      return { bridges: deputy.bridges, wet, population: state.population };
    } finally {
      setRules(base);
    }
  };

  const sought = withRules({});
  assert.ok(sought.bridges > 0, "the deputy never went looking for a crossing");
  assert.ok(sought.wet > 0, "it counted a crossing it did not pave");

  // And not onto nothing: `bridgeNeedsRoom` is free, unzoned ground within
  // `bridgeRoomReach` of where the bridge LANDS. Ask for more than a map can
  // hold and the rule stops firing — which is also what proves the room is the
  // thing being tested rather than the threshold.
  const none = withRules({ bridgeNeedsRoom: 100000 });
  assert.equal(none.bridges, 0, "a crossing was sought onto ground with no room on it");
  assert.ok(none.population > 0, "the city failed to grow at all, so this measures something else");
});
;

test("the deputy never borrows (L1)", () => {
  // It is the measurement instrument: an instrument that can go into debt
  // measures its own credit line. Forty years of a deputy city, and the books
  // say nothing was borrowed — which is also why L1's era bump does not move
  // the sweep.
  const { state } = play(5, 48, 40);
  for (const player of state.players) {
    assert.equal(player.debt ?? 0, 0, `seat ${player.seat} borrowed ${player.debt}`);
  }
});

// The vehicles a city sends somewhere (slice B3b).
//
// Ambient traffic has no errand: a car appears on a link in proportion to its
// load and leaves at the end of it. A fire engine has one, and the item asks
// for exactly four things to be true of it — one engine a fire, from the
// nearest station, along the lane graph, and none at all when nothing is
// burning. Those are the tests.
//
// The fires come from the TILE flags. `building.flags` is created as 0 and
// written by nothing in the engine (B1b, Q108), so a service that read it would
// answer no call ever made.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt } from "../shared/grid.js";
import { NET_PRESENT, FLAG_BURNING } from "../client/constants-mirror.js";
import { DEFAULTS, setConfig } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import {
  nearestLink, routeBetween, stationsOf, firesIn, dispatch, createServices, KINDS, SPEED,
} from "../client/life/services.js";

setConfig(DEFAULTS);
const T = DEFAULTS.tileM;

function town(size = 24) {
  const state = createState(defaultOptions({ width: size, height: size, seed: 7 }));
  const road = state.tiles.road;
  const tiles = [];
  for (let x = 2; x < size - 2; x += 1) { tiles.push([x, 6]); tiles.push([x, 16]); }
  for (let y = 6; y <= 16; y += 1) { tiles.push([4, y]); tiles.push([18, y]); }
  for (const [x, y] of tiles) road[tileAt(state.width, x, y)] = NET_PRESENT;
  for (const [x, y] of tiles) {
    const mask = adjacencyMask(state.width, state.height, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
    road[tileAt(state.width, x, y)] = NET_PRESENT | mask;
  }
  return state;
}

function station(state, def, x, y) {
  const id = state.buildings.length + 500;
  state.buildings.push({ id, def, zone: 0, x, y, w: 2, h: 2, level: 1, occupancy: 0, condition: 100, owner: 1 });
  for (let dy = 0; dy < 2; dy += 1) {
    for (let dx = 0; dx < 2; dx += 1) state.tiles.buildingId[tileAt(state.width, x + dx, y + dy)] = id;
  }
  return id;
}

const light = (state, x, y) => { state.tiles.flags[tileAt(state.width, x, y)] |= FLAG_BURNING; };

test("no fire, no engine", () => {
  const state = town();
  station(state, "fireStation", 5, 7);
  assert.deepEqual(firesIn(state), []);
  assert.deepEqual(dispatch(firesIn(state), stationsOf(state, "fireStation")), []);
});

test("a burning tile with one station gets exactly one engine", () => {
  const state = town();
  const id = station(state, "fireStation", 5, 7);
  light(state, 12, 7);
  const calls = dispatch(firesIn(state), stationsOf(state, "fireStation"));
  assert.equal(calls.length, 1, `${calls.length} engines for one fire`);
  assert.equal(calls[0].station, id);
});

test("a fire that has spread is one call, not four", () => {
  // B1a made fires spread; four tiles of one fire is one errand.
  const state = town();
  station(state, "fireStation", 5, 7);
  for (const [x, y] of [[12, 7], [13, 7], [12, 8], [13, 8]]) light(state, x, y);
  const fires = firesIn(state);
  assert.equal(fires.length, 1, `${fires.length} calls for one fire`);
  assert.equal(fires[0].tiles.length, 4);
  assert.equal(dispatch(fires, stationsOf(state, "fireStation")).length, 1);
});

test("two fires answer from the nearest station each", () => {
  const state = town();
  const west = station(state, "fireStation", 5, 7);
  const east = station(state, "fireStation", 19, 7);
  light(state, 7, 7);
  light(state, 17, 7);
  const calls = dispatch(firesIn(state), stationsOf(state, "fireStation"));
  assert.equal(calls.length, 2);
  const byFire = new Map(calls.map((c) => [c.to.x < 12 ? "west" : "east", c.station]));
  assert.equal(byFire.get("west"), west, "the western fire was answered from across town");
  assert.equal(byFire.get("east"), east, "the eastern fire was answered from across town");
});

test("and two fires beside ONE station are two engines from it", () => {
  const state = town();
  const only = station(state, "fireStation", 5, 7);
  light(state, 8, 7);
  light(state, 14, 16);
  const calls = dispatch(firesIn(state), stationsOf(state, "fireStation"));
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.station === only));
});

test("the route is on the lane graph, link by link", () => {
  // The one place this lane builds a planner. What makes it a route rather than
  // a line on a map is that every step is a link the graph says follows the one
  // before — a car that teleports between lanes is worse than no car.
  const state = town();
  const model = createModel(state);
  const from = nearestLink(model.lanes, 5 * T, 7 * T);
  const to = nearestLink(model.lanes, 17 * T, 16 * T);
  assert.ok(from && to, "no lane near the station or the fire");
  const route = routeBetween(model.lanes, from.link.id, to.link.id);
  assert.ok(route, "no route from the station to the fire");
  assert.ok(route.length > 1, "the route is one link");
  const byId = new Map(model.lanes.links.map((l) => [l.id, l]));
  for (let i = 1; i < route.length; i += 1) {
    const prev = byId.get(route[i - 1]);
    assert.ok((prev.next ?? []).some((step) => step.link === route[i]),
      `link ${route[i]} does not follow ${route[i - 1]} on the graph`);
  }
});

test("a station on another road network answers nothing", () => {
  // A city can have two networks and a station on the wrong one — the route
  // comes back undefined rather than a straight line through the houses.
  const state = town();
  const road = state.tiles.road;
  for (let x = 2; x < 8; x += 1) road[tileAt(state.width, x, 21)] = NET_PRESENT;
  for (let x = 2; x < 8; x += 1) {
    road[tileAt(state.width, x, 21)] = NET_PRESENT
      | adjacencyMask(state.width, state.height, x, 21, (i) => (road[i] & NET_PRESENT) !== 0);
  }
  const model = createModel(state);
  const island = nearestLink(model.lanes, 4 * T, 21 * T);
  const townLink = nearestLink(model.lanes, 12 * T, 6 * T);
  assert.ok(island && townLink);
  assert.equal(routeBetween(model.lanes, island.link.id, townLink.link.id), undefined);
});

test("an engine is quicker than a patrol, and both are data", () => {
  assert.ok(SPEED.engine > SPEED.patrol, "a patrol outruns a fire engine");
  assert.equal(KINDS.engine.def, "fireStation");
  assert.equal(KINDS.patrol.def, "policeStation");
});

// --- the fleet, driving ------------------------------------------------------

function fleetTown() {
  const state = town();
  station(state, "fireStation", 5, 7);
  station(state, "policeStation", 5, 17);
  // Somewhere for a patrol to go: crime is a tile layer the civic pass fills,
  // and a fixture with none sends the patrol nowhere at all.
  for (let x = 10; x < 16; x += 1) state.tiles.crime[tileAt(state.width, x, 16)] = 120 + x;
  return { state, model: createModel(state) };
}

test("a fleet is empty until the city needs one, and an engine appears with the fire", () => {
  const { state, model } = fleetTown();
  const services = createServices(state, model, { life: true });
  services.update(1);
  assert.equal(services.stats().engines, 0, "an engine turned out to nothing");
  light(state, 14, 7);
  services.update(1);
  assert.equal(services.stats().engines, 1);
  // And it goes away with the fire.
  state.tiles.flags[tileAt(state.width, 14, 7)] &= ~FLAG_BURNING;
  services.update(1);
  assert.equal(services.stats().engines, 0, "the engine stayed after the fire went out");
});

test("the engine drives, and it arrives at the fire", () => {
  const { state, model } = fleetTown();
  light(state, 16, 7);
  const services = createServices(state, model, { life: true });
  services.update(0.1);
  const start = services.fleet().find((v) => v.kind === "engine");
  assert.ok(start, "no engine");
  for (let t = 0; t < 200; t += 1) services.update(0.5);
  const end = services.fleet().find((v) => v.kind === "engine");
  assert.ok(end, "the engine vanished on the way");
  assert.ok(Math.hypot(end.x - start.x, end.y - start.y) > 2,
    `the engine moved ${Math.hypot(end.x - start.x, end.y - start.y).toFixed(1)} tiles`);
  assert.equal(end.arrived, true, "the engine never got there");
  assert.ok(Math.hypot(end.x - 16.5, end.y - 7.5) < 4,
    `the engine stopped ${Math.hypot(end.x - 16.5, end.y - 7.5).toFixed(1)} tiles from the fire`);
});

test("a patrol drives its beat without a fire anywhere", () => {
  const { state, model } = fleetTown();
  const services = createServices(state, model, { life: true });
  services.update(0.1);
  assert.equal(services.stats().patrols, 1, "the station sent no patrol");
  const start = services.fleet().find((v) => v.kind === "patrol");
  for (let t = 0; t < 60; t += 1) services.update(0.5);
  const now = services.fleet().find((v) => v.kind === "patrol");
  assert.ok(now, "the patrol vanished");
  assert.ok(Math.hypot(now.x - start.x, now.y - start.y) > 1, "the patrol never left the station");
});

test("the fleet is not a function of the camera (D7)", () => {
  // The invariant this lane keeps: what EXISTS is the city's business and the
  // bounds decide only what is drawn.
  const { state, model } = fleetTown();
  light(state, 14, 7);
  const services = createServices(state, model, { life: true });
  for (let t = 0; t < 10; t += 1) services.update(0.2);
  const all = services.count();
  const posed = [];
  services.pose({ car1: "car1", car2: "car2" }, (pool) => posed.push(pool),
    { x0: 0, y0: 0, x1: 2, y1: 2 });
  assert.equal(services.count(), all, "the camera changed how many vehicles exist");
  assert.ok(posed.length < all, "a window with no road in it drew the whole fleet");
});

test("frozen life still musters, and never moves", () => {
  // `?life=0` freezes the world for a screenshot; a fleet that does not exist
  // in a frozen frame is a shot of a fire nobody answered.
  const { state, model } = fleetTown();
  light(state, 14, 7);
  const services = createServices(state, model, { life: false });
  services.update(1);
  const first = services.fleet();
  assert.equal(first.length > 0, true, "a frozen city has no fleet at all");
  for (let t = 0; t < 20; t += 1) services.update(1);
  assert.deepEqual(services.fleet(), first, "a frozen fleet moved");
});

test("a beat the car cannot drive to is skipped for one it can", () => {
  // The road network has more than one component — a played 64×64 has 8,426
  // links in the main one and 476 in stubs and islands — so the worst crime in
  // a station's reach may be somewhere no car can get to. The patrol took the
  // worst tile, found no route and never turned out at all; it takes the worst
  // REACHABLE one now.
  const state = town();
  station(state, "policeStation", 5, 17);
  // An island of road with the worst crime in the city on it.
  const island = [];
  for (let x = 8; x < 12; x += 1) island.push([x, 21]);
  for (const [x, y] of island) state.tiles.road[tileAt(state.width, x, y)] = NET_PRESENT;
  for (const [x, y] of island) {
    state.tiles.road[tileAt(state.width, x, y)] = NET_PRESENT
      | adjacencyMask(state.width, state.height, x, y, (i) => (state.tiles.road[i] & NET_PRESENT) !== 0);
    state.tiles.crime[tileAt(state.width, x, y)] = 250;
  }
  // And ordinary crime on the town's own streets.
  for (let x = 8; x < 16; x += 1) state.tiles.crime[tileAt(state.width, x, 16)] = 90;
  const model = createModel(state);
  const services = createServices(state, model, { life: true });
  services.update(0.5);
  assert.equal(services.stats().patrols, 1, "the patrol gave up because the worst crime was unreachable");
  const car = services.fleet().find((v) => v.kind === "patrol");
  assert.ok(car.y < 20, `the patrol is at ${car.y.toFixed(1)}, which is on the island`);
});

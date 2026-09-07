// The nav graph pedestrians walk on (slice E7; spec §9.3).
//
// The lane graph's mistakes all looked fine in a screenshot and this one's are
// worse, because a person is small: a pavement edge on the wrong side gives
// people walking in the carriageway, an edge that does not stop short of a
// junction gives people walking through the traffic, a crossing that does not
// know its node gives people stepping out on a green light, and a door that
// misses its pavement gives commuters materialising in a hedge.
//
// Pure, derived, and in `client/world/` — the same contract the lane graph has
// (ruling 032). Nothing here is remembered or agreed between clients.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt } from "../shared/grid.js";
import { NET_PRESENT } from "../client/constants-mirror.js";
import { DEFAULTS, setConfig } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { deriveNav, WALK_OFFSET } from "../client/world/nav.js";

setConfig(DEFAULTS);
const T = DEFAULTS.tileM;

function blank(size = 16) {
  const state = createState(defaultOptions({ width: size, height: size, seed: 7 }));
  state.tiles.elevation.fill(40);
  return state;
}

function pave(state, tiles) {
  const road = state.tiles.road;
  for (const [x, y] of tiles) road[tileAt(state.width, x, y)] = NET_PRESENT;
  for (const [x, y] of tiles) {
    const mask = adjacencyMask(state.width, state.height, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
    road[tileAt(state.width, x, y)] = NET_PRESENT | mask;
  }
}

const row = (y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, k) => [x0 + k, y]);
const col = (x, y0, y1) => Array.from({ length: y1 - y0 + 1 }, (_, k) => [x, y0 + k]);

function place(state, b) {
  const building = {
    id: b.id, def: "", zone: 1, x: 0, y: 0, w: 1, h: 1, owner: 1,
    level: 2, valueTier: 1, occupancy: 30, condition: 100, builtTick: 0, flags: 0, ...b,
  };
  state.buildings.push(building);
  for (let y = building.y; y < building.y + building.h; y += 1) {
    for (let x = building.x; x < building.x + building.w; x += 1) {
      state.tiles.buildingId[tileAt(state.width, x, y)] = building.id;
    }
  }
  return building;
}

function navOf(state) {
  const model = createModel(state);
  return { model, nav: deriveNav(state, model) };
}

// --- the pavements -----------------------------------------------------------

test("every corridor gets a pavement on each side", () => {
  const state = blank();
  pave(state, row(8, 2, 13));
  const { model, nav } = navOf(state);
  const walks = nav.edges.filter((e) => e.kind === "walk");
  assert.equal(walks.length, model.corridors.length * 2, `${walks.length} pavements for ${model.corridors.length} corridors`);
});

test("a pavement is on the pavement, not in the road and not in the gardens", () => {
  const state = blank();
  pave(state, row(8, 2, 13));
  const { nav } = navOf(state);
  const centre = 8.5 * T;
  const half = DEFAULTS.road.width / 2;
  for (const edge of nav.edges.filter((e) => e.kind === "walk")) {
    const across = Math.abs(edge.pts[2] - centre);
    assert.ok(across > half, `a pavement ${across.toFixed(2)} m from the middle is in the carriageway`);
    assert.ok(across < half + DEFAULTS.road.sidewalk,
      `a pavement ${across.toFixed(2)} m out has walked past the kerb`);
    assert.ok(Math.abs(across - WALK_OFFSET()) < 1e-6);
  }
});

test("the two pavements of one corridor are on opposite sides", () => {
  const state = blank();
  pave(state, row(8, 2, 13));
  const { nav } = navOf(state);
  const [a, b] = nav.edges.filter((e) => e.kind === "walk");
  assert.equal(Math.sign(a.pts[2] - 8.5 * T), -Math.sign(b.pts[2] - 8.5 * T));
});

test("a pavement stops short of the junction it runs into", () => {
  // Otherwise people walk straight through the box the cars turn in.
  const state = blank();
  pave(state, [...row(8, 2, 13), ...col(8, 2, 13)]);
  const { model, nav } = navOf(state);
  const junction = model.nodes.find((n) => n.kind === "junction");
  assert.ok(junction, "the fixture has no crossroads in it");
  const clear = DEFAULTS.road.width / 2 + DEFAULTS.road.sidewalk;
  for (const edge of nav.edges.filter((e) => e.kind === "walk")) {
    for (const end of [0, edge.cum.length - 1]) {
      const d = Math.hypot(edge.pts[end * 3] - junction.x, edge.pts[end * 3 + 2] - junction.z);
      assert.ok(d > clear - 1e-6, `a pavement ends ${d.toFixed(2)} m from the middle of a junction`);
    }
  }
});

// --- the crossings -----------------------------------------------------------

test("a crossing joins the two pavements of one corridor at a node", () => {
  const state = blank();
  pave(state, [...row(8, 2, 13), ...col(8, 2, 13)]);
  const { nav } = navOf(state);
  const crossings = nav.edges.filter((e) => e.kind === "cross");
  assert.ok(crossings.length > 0, "nobody can get to the other side of the street");
  for (const c of crossings) {
    assert.ok(c.len >= DEFAULTS.road.width, `a ${c.len.toFixed(2)} m crossing over an 8 m road`);
    assert.ok(c.len < DEFAULTS.road.width + DEFAULTS.road.sidewalk * 2 + 1);
  }
});

test("a crossing knows which node it is on, so a signal can reach it", () => {
  // A crossing that does not know its node is a crossing nobody waits at, and
  // the light was the whole reason the nav graph is a graph rather than a line.
  // The AXIS is carried only where there is a light to obey (T1) — see below.
  const state = blank();
  pave(state, [...row(8, 2, 13), ...col(8, 2, 13)]);
  const { model, nav } = navOf(state);
  for (const c of nav.edges.filter((e) => e.kind === "cross")) {
    assert.equal(typeof c.node, "number");
    assert.ok(c.node >= 0);
    if (!model.lanes.signals.has(c.node)) continue;
    assert.ok(c.axis === "ns" || c.axis === "ew", `axis "${c.axis}"`);
  }
});

// --- the graph is connected ---------------------------------------------------

test("every edge leads somewhere, and every node is reachable from an edge", () => {
  const state = blank();
  pave(state, [...row(8, 2, 13), ...col(8, 2, 13)]);
  const { nav } = navOf(state);
  for (const edge of nav.edges) {
    assert.ok(nav.nodes[edge.from], `edge ${edge.id} comes from nowhere`);
    assert.ok(nav.nodes[edge.to], `edge ${edge.id} goes nowhere`);
  }
  // A pavement is walked in both directions, so every edge has to be leavable
  // from either end.
  const dead = nav.edges.filter((e) => nav.next(e, 1).length === 0 && nav.next(e, -1).length === 0);
  assert.deepEqual(dead.map((e) => e.kind), [], `${dead.length} edges nobody can leave`);
});

test("a pavement at a crossroads can be left by a crossing and by a corner", () => {
  const state = blank();
  pave(state, [...row(8, 2, 13), ...col(8, 2, 13)]);
  const { nav } = navOf(state);
  const inner = nav.edges.filter((e) => e.kind === "walk")
    .map((e) => nav.next(e, 1).concat(nav.next(e, -1)).map((n) => nav.edges[n].kind));
  const kinds = new Set(inner.flat());
  assert.ok(kinds.has("cross"), "no pavement leads to a crossing");
  assert.ok(kinds.has("corner"), "no pavement leads round a corner");
});

// --- the doors ----------------------------------------------------------------

test("a lot's door sits on the pavement it opens onto", () => {
  const state = blank();
  pave(state, row(8, 2, 13));
  place(state, { id: 1, x: 5, y: 9, w: 1, h: 1, zone: 1, occupancy: 40 });
  const { nav } = navOf(state);
  assert.equal(nav.doors.length, 1);
  const door = nav.doors[0];
  const edge = nav.edges[door.edge];
  assert.equal(edge.kind, "walk", "a door opens onto something that is not a pavement");
  assert.ok(door.dist < DEFAULTS.road.sidewalk + 4, `the door is ${door.dist.toFixed(2)} m from its pavement`);
  assert.ok(door.s >= 0 && door.s <= edge.len);
});

test("a door is on the near side of the street, not across it", () => {
  const state = blank();
  pave(state, row(8, 2, 13));
  place(state, { id: 1, x: 5, y: 9, w: 1, h: 1, zone: 1 });
  const { nav } = navOf(state);
  const edge = nav.edges[nav.doors[0].edge];
  const centre = 8.5 * T;
  // The building is south of the road, so the pavement it uses must be too.
  assert.ok(edge.pts[2] > centre, "the door opens onto the far pavement");
});

test("a lot with no road anywhere near it still gets a door rather than a crash", () => {
  const state = blank();
  pave(state, row(2, 2, 5));
  place(state, { id: 1, x: 12, y: 12, w: 1, h: 1, zone: 1 });
  const { nav } = navOf(state);
  assert.equal(nav.doors.length, 1);
  assert.ok(Number.isFinite(nav.doors[0].s));
});

test("how many people a pavement asks for follows the occupancy on it", () => {
  const state = blank();
  pave(state, row(8, 2, 13));
  place(state, { id: 1, x: 5, y: 9, w: 1, h: 1, zone: 1, occupancy: 200 });
  const busy = navOf(state).nav;
  const quiet = (() => {
    const s2 = blank();
    pave(s2, row(8, 2, 13));
    place(s2, { id: 1, x: 5, y: 9, w: 1, h: 1, zone: 1, occupancy: 10 });
    return navOf(s2).nav;
  })();
  const total = (nav) => nav.edges.reduce((n, e) => n + nav.demandOf(e), 0);
  assert.ok(total(busy) > total(quiet), `${total(busy)} against ${total(quiet)}`);
  assert.equal(total(navOf(blank()).nav), 0, "an empty city wants people on it");
});

// --- sampling -----------------------------------------------------------------

test("sampling an edge walks it end to end and clamps outside it", () => {
  const state = blank();
  pave(state, row(8, 2, 13));
  const { nav } = navOf(state);
  const edge = nav.edges.find((e) => e.kind === "walk");
  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  nav.sample(edge, 0, out);
  const start = { x: out.x, z: out.z };
  nav.sample(edge, edge.len, out);
  const end = { x: out.x, z: out.z };
  assert.ok(Math.abs(Math.hypot(end.x - start.x, end.z - start.z) - edge.len) < 0.5);
  nav.sample(edge, -50, out);
  assert.ok(Math.hypot(out.x - start.x, out.z - start.z) < 1e-6, "walked off the start of the pavement");
  nav.sample(edge, edge.len + 50, out);
  assert.ok(Math.hypot(out.x - end.x, out.z - end.z) < 1e-6, "walked off the end of the pavement");
});

test("a pavement is at pavement height, a kerb above the road", () => {
  const state = blank();
  pave(state, row(8, 2, 13));
  const { model, nav } = navOf(state);
  const edge = nav.edges.find((e) => e.kind === "walk");
  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  nav.sample(edge, edge.len / 2, out);
  const ground = model.heightAt(out.x, out.z);
  assert.ok(out.y - ground >= DEFAULTS.road.kerb, `${(out.y - ground).toFixed(3)} m above the ground`);
});

test("the graph is a function of the state and nothing else", () => {
  const state = blank();
  pave(state, [...row(8, 2, 13), ...col(8, 2, 13)]);
  place(state, { id: 1, x: 5, y: 9, w: 1, h: 1, zone: 1 });
  const a = navOf(state).nav;
  const b = navOf(state).nav;
  assert.deepEqual(a.stats, b.stats);
  assert.deepEqual(a.doors.map((d) => [d.lot, d.edge, Math.round(d.s * 1e6)]),
    b.doors.map((d) => [d.lot, d.edge, Math.round(d.s * 1e6)]));
});

// --- a crossing without a light (slice T1, A51) ------------------------------

test("a crossing at an unsignalled node has no axis to wait for", () => {
  // Since T1 only a crossing of two real streets is signalled, so most nodes
  // are give-way. A `cross` edge there cannot carry a signal axis: there is no
  // signal, and a pedestrian holding for a phase that never changes waits for
  // ever.
  const state = blank(24);
  pave(state, [...row(8, 2, 21), ...col(8, 8, 21)]);   // a T, not a crossroads
  const { model, nav } = navOf(state);
  const tee = model.nodes.find((n) => n.degree === 3);
  assert.ok(tee, "no T in the fixture");
  assert.equal(model.lanes.signals.has(tee.id), false);
  const crossings = nav.edges.filter((e) => e.kind === "cross" && e.node === tee.id);
  assert.ok(crossings.length > 0, "the T has no crossing at all");
  for (const c of crossings) assert.equal(c.axis, undefined, `axis "${c.axis}"`);
});

test("a crossing at a signalled crossroads still carries its axis", () => {
  const state = blank(24);
  pave(state, [...row(8, 2, 21), ...col(12, 2, 21)]);
  const { model, nav } = navOf(state);
  const cross = model.nodes.find((n) => n.degree === 4);
  assert.equal(model.lanes.signals.has(cross.id), true);
  for (const c of nav.edges.filter((e) => e.kind === "cross" && e.node === cross.id)) {
    assert.ok(c.axis === "ns" || c.axis === "ew", `axis "${c.axis}"`);
  }
});

// People on the pavement (slice E7; spec §9.3, ruling 037).
//
// The same contract the cars have: nothing here is state, nothing is saved,
// nothing is agreed between clients. Every choice a person makes is a hash of
// an integer that is already in state, so two clients looking at the same city
// see the same crowd without exchanging a byte.
//
// Renderer-local, so it remembers where everybody is between frames — which is
// why it is in `client/life/` — and it takes its time as a delta from the
// caller, which is what makes `?life=0` freeze it.
//
// What is worth asserting is what a screenshot cannot show: that nobody walks
// in the carriageway, that a red light is actually waited at, that the cap is a
// cap, and that a frozen city still has people standing on it.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt } from "../shared/grid.js";
import { NET_PRESENT } from "../client/constants-mirror.js";
import { DEFAULTS, setConfig } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { deriveNav } from "../client/world/nav.js";
import { createPedestrians } from "../client/life/pedestrians.js";

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
  state.buildings.push({
    id: b.id, def: "", zone: 1, x: 0, y: 0, w: 1, h: 1, owner: 1,
    level: 3, valueTier: 1, occupancy: 120, condition: 100, builtTick: 0, flags: 0, ...b,
  });
  state.tiles.buildingId[tileAt(state.width, b.x, b.y)] = b.id;
}

/** A street with buildings down one side and a crossroads in the middle. */
function town({ crossroads = true, houses = 6 } = {}) {
  const state = blank(24);
  pave(state, crossroads ? [...row(12, 2, 21), ...col(12, 2, 21)] : row(12, 2, 21));
  for (let i = 0; i < houses; i += 1) place(state, { id: i + 1, x: 3 + i * 2, y: 13 });
  const model = createModel(state);
  const nav = deriveNav(state, model);
  return { state, model, nav };
}

function run(peds, seconds, dt = 1 / 30) {
  for (let i = 0; i < Math.round(seconds / dt); i += 1) peds.update(dt);
}

// --- there are people, and they are on the pavement ---------------------------

test("a city with buildings on it grows a crowd", () => {
  const { state, model, nav } = town();
  const peds = createPedestrians(state, model, nav, { cap: 200 });
  run(peds, 20);
  assert.ok(peds.people().length > 0, "nobody came out");
});

test("an empty city has nobody on it", () => {
  // The demand comes from the buildings; a bare road should not manufacture
  // pedestrians out of nothing, which is the shape of "the gate measured the
  // ceiling" this project keeps finding.
  const state = blank(24);
  pave(state, row(12, 2, 21));
  const model = createModel(state);
  const peds = createPedestrians(state, model, deriveNav(state, model), { cap: 200 });
  run(peds, 20);
  assert.equal(peds.people().length, 0);
});

test("nobody walks in the carriageway", () => {
  const { state, model, nav } = town();
  const peds = createPedestrians(state, model, nav, { cap: 200 });
  const half = DEFAULTS.road.width / 2;
  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  for (let step = 0; step < 900; step += 1) {
    peds.update(1 / 30);
    for (const p of peds.people()) {
      const edge = nav.edges[p.edge];
      if (edge.kind !== "walk") continue;   // a crossing IS in the road
      nav.sample(edge, p.s, out);
      const near = model.nearestCorridor(out.x, out.z, 40);
      assert.ok(!near || near.dist > half - 1e-6,
        `somebody is ${near?.dist.toFixed(2)} m from a centre line on a ${half} m half-carriageway`);
    }
  }
});

test("a person stays on the edge they are on, between its ends", () => {
  const { state, model, nav } = town();
  const peds = createPedestrians(state, model, nav, { cap: 200 });
  for (let step = 0; step < 600; step += 1) {
    peds.update(1 / 30);
    for (const p of peds.people()) {
      const edge = nav.edges[p.edge];
      assert.ok(edge, "a person is on an edge that does not exist");
      assert.ok(p.s >= -1e-6 && p.s <= edge.len + 1e-6, `${p.s} of ${edge.len}`);
    }
  }
});

// --- the cap -------------------------------------------------------------------

test("the cap is a cap, and zero means none at all", () => {
  const { state, model, nav } = town({ houses: 10 });
  const capped = createPedestrians(state, model, nav, { cap: 5 });
  run(capped, 40);
  assert.ok(capped.people().length <= 5, `${capped.people().length} people against a cap of 5`);

  const none = createPedestrians(state, model, nav, { cap: 0 });
  run(none, 40);
  assert.equal(none.people().length, 0, "the Low tier has pedestrians on it");
});

test("a busier city puts more people on the street than a quiet one", () => {
  const busy = town({ houses: 10 });
  const quiet = town({ houses: 2 });
  const a = createPedestrians(busy.state, busy.model, busy.nav, { cap: 400 });
  const b = createPedestrians(quiet.state, quiet.model, quiet.nav, { cap: 400 });
  run(a, 40);
  run(b, 40);
  assert.ok(a.people().length > b.people().length,
    `${a.people().length} on ten houses against ${b.people().length} on two`);
});

// --- the clock ------------------------------------------------------------------

test("no time passing means nobody moves, so `life=0` freezes the crowd", () => {
  const { state, model, nav } = town();
  const peds = createPedestrians(state, model, nav, { cap: 200 });
  run(peds, 20);
  const before = peds.people().map((p) => `${p.edge}:${p.s.toFixed(6)}`);
  peds.update(0);
  assert.deepEqual(peds.people().map((p) => `${p.edge}:${p.s.toFixed(6)}`), before);
});

test("a frozen city still has people standing on it", () => {
  // `?life=0` is for screenshots, and an empty pavement is not the picture
  // anybody wants to check — the same decision the traffic took (V1).
  const { state, model, nav } = town();
  const peds = createPedestrians(state, model, nav, { cap: 200, life: false });
  assert.ok(peds.people().length > 0, "the frozen street is empty");
  const before = peds.people().map((p) => `${p.edge}:${p.s.toFixed(6)}`);
  run(peds, 10);
  assert.deepEqual(peds.people().map((p) => `${p.edge}:${p.s.toFixed(6)}`), before,
    "somebody moved on a frozen street");
});

test("a delta of several seconds does not teleport anybody", () => {
  // A backgrounded tab hands back one enormous frame; a person who advances
  // forty metres in one step walks through a junction and out the other side.
  const { state, model, nav } = town();
  const peds = createPedestrians(state, model, nav, { cap: 200 });
  run(peds, 10);
  const was = new Map(peds.people().map((p) => [p.id, { edge: p.edge, s: p.s }]));
  peds.update(30);
  for (const p of peds.people()) {
    const before = was.get(p.id);
    if (!before || before.edge !== p.edge) continue;
    assert.ok(Math.abs(p.s - before.s) < 5, `${Math.abs(p.s - before.s).toFixed(1)} m in one step`);
  }
});

// --- the signals ------------------------------------------------------------------

test("somebody stepping onto a crossing waits when the light is against them", () => {
  const { state, model, nav } = town();
  const peds = createPedestrians(state, model, nav, { cap: 200 });
  run(peds, 120);
  assert.ok(peds.waited > 0, "nobody has waited at a light in two minutes of walking");
});

test("nobody waits for ever: every crossing is crossed", () => {
  const { state, model, nav } = town();
  const peds = createPedestrians(state, model, nav, { cap: 200 });
  run(peds, 240);
  assert.ok(peds.crossed > 0, "not one person got across a road in four minutes");
});

// --- what the cars have to see -----------------------------------------------------

test("somebody on a crossing is reported as something a car must stop for (A45)", () => {
  const { state, model, nav } = town();
  const peds = createPedestrians(state, model, nav, { cap: 200 });
  let sawOne = false;
  for (let step = 0; step < 3600; step += 1) {
    peds.update(1 / 30);
    const onRoad = peds.people().filter((p) => nav.edges[p.edge].kind === "cross").length;
    const yields = peds.yields();
    assert.equal(yields.length, onRoad, "the yield list and the people in the road disagree");
    if (onRoad > 0) {
      sawOne = true;
      for (const y of yields) {
        assert.ok(Number.isFinite(y.x) && Number.isFinite(y.z));
      }
    }
  }
  assert.ok(sawOne, "nobody stepped into the road in two minutes");
});

// --- determinism --------------------------------------------------------------------

test("two runs of the same city are the same crowd", () => {
  const a = town();
  const b = town();
  const pa = createPedestrians(a.state, a.model, a.nav, { cap: 200 });
  const pb = createPedestrians(b.state, b.model, b.nav, { cap: 200 });
  run(pa, 30);
  run(pb, 30);
  const key = (peds) => peds.people().map((p) => `${p.id}:${p.edge}:${p.s.toFixed(6)}`).join("|");
  assert.equal(key(pa), key(pb));
});

// --- crossing where there is no light (slice T1, A51) ------------------------

test("somebody at an unsignalled crossing waits for a gap rather than a phase", () => {
  // Since T1 only a crossing of two real streets is signalled, so most nodes
  // are give-way. A pedestrian holding for a phase that never changes waits for
  // ever, and one who steps out without looking is run over by a car that never
  // had to stop.
  const { state, model, nav } = town({ crossroads: false });
  const peds = createPedestrians(state, model, nav, { cap: 200 });
  const unsignalled = nav.edges.filter((e) => e.kind === "cross" && e.axis === undefined);
  assert.ok(unsignalled.length > 0, "the fixture has no unsignalled crossing");
  // With a car sitting on the crossing's own corridor, nobody steps onto it.
  const busy = new Set([unsignalled[0].corridor]);
  peds.setTraffic((corridor) => busy.has(corridor));
  run(peds, 60);
  for (const person of peds.people()) {
    assert.notEqual(person.edge, unsignalled[0].id,
      "somebody walked into the road in front of a car");
  }
});

test("and crosses once the road is clear", () => {
  const { state, model, nav } = town({ crossroads: false });
  const peds = createPedestrians(state, model, nav, { cap: 200 });
  peds.setTraffic(() => false);
  run(peds, 120);
  assert.ok(peds.crossed > 0, "nobody ever got across an unsignalled road");
});

test("with nothing to ask, an unsignalled crossing is simply open", () => {
  // `setTraffic` is optional: a caller that does not wire the cars up gets a
  // crowd that crosses freely rather than one frozen on the kerb.
  const { state, model, nav } = town({ crossroads: false });
  const peds = createPedestrians(state, model, nav, { cap: 200 });
  run(peds, 120);
  assert.ok(peds.crossed > 0, "the crowd is stuck on the pavement");
});

test("the node reaches the cars, so one busy crossing is not all of them", () => {
  // M5, after the D5 review. A corridor runs between two crossings and the
  // question a person asks is about the one they are standing at. `busyAt` was
  // dropping the node, so a car leaving the far end held this kerb — and the
  // wiring here is what makes that visible from the crowd's side: given an
  // answer that is busy at ONE node, only that crossing may hold.
  const { state, model, nav } = town({ crossroads: false });
  const peds = createPedestrians(state, model, nav, { cap: 200 });
  const unsignalled = nav.edges.filter((e) => e.kind === "cross" && e.axis === undefined);
  const shared = unsignalled.find((e) => unsignalled.some(
    (o) => o.corridor === e.corridor && o.node !== e.node));
  assert.ok(shared, "no corridor in the fixture has an unsignalled crossing at both ends");
  const twin = unsignalled.find((e) => e.corridor === shared.corridor && e.node !== shared.node);

  const asked = [];
  peds.setTraffic((corridor, node) => {
    asked.push([corridor, node]);
    return corridor === shared.corridor && node === shared.node;
  });
  run(peds, 120);

  assert.ok(asked.some(([, node]) => node !== undefined),
    "the crowd asks about a corridor without saying which end of it");
  assert.ok(asked.some(([c, n]) => c === twin.corridor && n === twin.node),
    "the twin crossing was never asked about");
  for (const person of peds.people()) {
    assert.notEqual(person.edge, shared.id, "somebody crossed where a car was coming");
  }
  assert.ok(peds.crossed > 0, "the whole crowd stopped because one crossing was busy");
});

// --- the crowd seen from the air (slice B7) -----------------------------------
//
// "A separate pedCapCity spent across the visible pavements by demand rather
// than nearest the eye ... never a function of the camera for how many exist,
// only for which are drawn."

/** A grid of streets with houses along every one, so demand is everywhere. */
function suburb() {
  const state = blank(40);
  const tiles = [];
  for (const y of [6, 14, 22, 30]) tiles.push(...row(y, 2, 37));
  for (const x of [6, 14, 22, 30]) tiles.push(...col(x, 2, 37));
  pave(state, tiles);
  let id = 1;
  for (const y of [5, 13, 21, 29]) {
    for (let x = 3; x <= 36; x += 2) {
      if ([6, 14, 22, 30].includes(x)) continue;
      place(state, { id: id++, x, y });
    }
  }
  const model = createModel(state);
  const nav = deriveNav(state, model);
  return { state, model, nav };
}

const settle = (crowd, seconds, bounds, focus) => {
  for (let t = 0; t < seconds; t += 1 / 30) crowd.update(1 / 30, bounds, focus);
};

test("the city crowd is the same crowd whatever the camera is doing", () => {
  const { state, model, nav } = suburb();
  const a = createPedestrians(state, model, nav, { cap: 150, spread: true });
  const b = createPedestrians(state, model, nav, { cap: 150, spread: true });
  settle(a, 20, { x0: 0, y0: 0, x1: 10, y1: 10 }, { x: 3, z: 3 });
  settle(b, 20, { x0: 28, y0: 28, x1: 39, y1: 39 }, { x: 36, z: 36 });
  const where = (c) => c.people().map((p) => `${p.id}:${p.edge}:${p.s.toFixed(3)}`).join(" ");
  assert.ok(a.count() > 50, `only ${a.count()} people in the city crowd`);
  assert.equal(where(a), where(b), "two cameras made two different crowds");
});

test("the city crowd spreads over the city rather than gathering at the eye", () => {
  // Same cap, same camera in one corner: E7's crowd spends it nearest the eye,
  // the city crowd across every pavement.
  const { state, model, nav } = suburb();
  const bounds = { x0: 0, y0: 0, x1: 39, y1: 39 };
  const focus = { x: 4, z: 4 };
  const near = createPedestrians(state, model, nav, { cap: 60 });
  const city = createPedestrians(state, model, nav, { cap: 60, spread: true });
  settle(near, 20, bounds, focus);
  settle(city, 20, bounds, focus);
  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  const meanDistance = (c) => {
    const d = c.people().map((p) => {
      nav.sample(nav.edges[p.edge], p.s, out);
      return Math.hypot(out.x / T - focus.x, out.z / T - focus.z);
    });
    return d.reduce((s, x) => s + x, 0) / Math.max(1, d.length);
  };
  assert.equal(city.count(), 60, "the cap was not spent");
  assert.ok(meanDistance(city) > meanDistance(near) * 1.5,
    `the city crowd is ${meanDistance(city).toFixed(1)} tiles from the eye on average, E7's ${meanDistance(near).toFixed(1)}`);
});

test("the near crowd tops a street up to its demand instead of doubling it", () => {
  const { state, model, nav } = suburb();
  const alone = createPedestrians(state, model, nav, {});
  const bounds = { x0: 0, y0: 0, x1: 39, y1: 39 };
  settle(alone, 20, bounds, { x: 20, z: 20 });
  const city = createPedestrians(state, model, nav, { spread: true });
  const near = createPedestrians(state, model, nav, { reserve: (id) => city.heldOn(id) });
  for (let t = 0; t < 20; t += 1 / 30) {
    city.update(1 / 30);
    near.update(1 / 30, bounds, { x: 20, z: 20 });
  }
  // With the city crowd uncapped it already meets the demand, so the near
  // crowd should find almost nothing to add. Reading the city crowd's count
  // from the START of its step, the near one refilled every shortfall the city
  // crowd was refilling in the same frame: 509 + 408 where one crowd alone
  // held 482. Recounted after the step it is 509 + 31.
  assert.ok(alone.count() > 50, `only ${alone.count()} people to compare against`);
  assert.ok(near.count() <= city.count() * 0.1 + 2,
    `${city.count()} + ${near.count()} people where one crowd alone held ${alone.count()}`);
});

test("pose draws each person as the figure the spot resolves, or not at all", () => {
  const { state, model, nav } = suburb();
  const city = createPedestrians(state, model, nav, { cap: 200, spread: true });
  settle(city, 10);
  const pushed = [];
  const pools = { ped0: "ped0", ped1: "ped1", pedCity: "pedCity" };
  // West of x = 20 resolves as the figure from the air, east of it as nothing.
  const figureAt = (x) => (x < 20 ? "l2" : null);
  city.pose(pools, (pool, x, y, z, sx, sy, sz, colour) => pushed.push({ pool, x, colour }),
    [0x123456], undefined, figureAt, 0xff00ff);
  assert.ok(pushed.length > 10, `only ${pushed.length} posed`);
  assert.ok(pushed.every((p) => p.pool === "pedCity"), "somebody drawn in the wrong pool");
  assert.ok(pushed.every((p) => p.x < 20), "somebody drawn where nothing resolves");
  assert.ok(pushed.every((p) => p.colour === 0xff00ff), "the colour override was ignored");
  const seen = city.countBy(undefined, figureAt);
  assert.equal(seen.l2, pushed.length, "the budget's count and the pose disagree");
  assert.equal(seen.l3, 0);
});

test("a frozen city crowd is there at once, and is the same picture twice", () => {
  const { state, model, nav } = suburb();
  const city = createPedestrians(state, model, nav, { cap: 200, spread: true, life: false });
  const snap = () => city.people().map((p) => `${p.edge}:${p.s.toFixed(3)}`).join(" ");
  assert.ok(city.count() > 50, `only ${city.count()} people in a frozen city crowd`);
  const before = snap();
  city.update(1 / 30, { x0: 0, y0: 0, x1: 5, y1: 5 }, { x: 2, z: 2 });
  city.pose({ ped0: {}, ped1: {}, pedCity: {} }, () => {}, [0], { x0: 0, y0: 0, x1: 5, y1: 5 }, () => "l2");
  assert.equal(snap(), before, "a frozen city crowd moved or re-settled for the camera");
});

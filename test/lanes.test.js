// The lane graph (slice E1; specs/engine/04-city-model.md §4.6, ruling 037).
//
// A corridor is where the road is; a lane is where a car is. The difference is
// a direction, an offset to the right of the centreline, a stop line short of
// the junction, and a curve through it — and every one of those is arithmetic
// that looks fine in a screenshot when it is wrong. A lane on the wrong side
// gives left-hand traffic; a link that is longer than the corridor puts cars
// inside the junction; a connector that does not join its endpoints teleports
// them.
//
// Pure, so all of it is here rather than in a browser gate.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt } from "../shared/grid.js";
import { NET_PRESENT, NET_AVENUE } from "../client/constants-mirror.js";
import { DEFAULTS, getConfig } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { isSignalled } from "../client/world/signals.js";
import { LONGEST_BODY } from "../client/world/vehicle-spec.js";

const T = DEFAULTS.tileM;
const { stopLine, width: ROAD_W, lanes: LANES } = DEFAULTS.road;

function blank(size = 10) {
  return createState(defaultOptions({ width: size, height: size, seed: 7 }));
}

/** Paves every group and THEN recomputes every mask.
 *
 * In two calls the second never revisits the tile the two runs share, so a
 * crossroads keeps the straight-through mask it had before the second road
 * arrived — no junction, and a corridor walk that wanders the whole map
 * looking for an end. The reducer never leaves a mask inconsistent; a test
 * helper must not either. */
function pave(state, ...groups) {
  const road = state.tiles.road;
  const tiles = groups.flat();
  for (const [x, y] of tiles) road[tileAt(state.width, x, y)] = NET_PRESENT;
  for (const [x, y] of tiles) {
    const mask = adjacencyMask(state.width, state.height, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
    road[tileAt(state.width, x, y)] = NET_PRESENT | mask;
  }
}

const row = (y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, k) => [x0 + k, y]);
const column = (x, y0, y1) => Array.from({ length: y1 - y0 + 1 }, (_, k) => [x, y0 + k]);

/** A straight east-west road of six tiles, ends at both sides. */
function straight() {
  const state = blank();
  pave(state, row(4, 2, 7));
  return createModel(state).lanes;
}

const blocks = (lanes) => lanes.links.filter((l) => l.kind === "block");
const turns = (lanes) => lanes.links.filter((l) => l.kind === "turn");

// --- the lanes themselves ----------------------------------------------------

test("a straight road of six tiles is two links, one each way", () => {
  const lanes = straight();
  assert.equal(blocks(lanes).length, 2, "a two-way road is two lanes");
  for (const link of blocks(lanes)) {
    // Five gaps between six tile centres, less a stop line at each end.
    assert.ok(Math.abs(link.len - (5 * T - 2 * stopLine)) < 1e-6,
      `${link.len} is not ${5 * T - 2 * stopLine}`);
  }
});

test("a lane sits to the RIGHT of the centreline, which is which side of the road", () => {
  // Right-hand traffic (§4.6). Travelling north the lane is on the east side:
  // get this backwards and every car in the city drives on the left, which no
  // test that counts links will ever notice.
  const state = blank();
  pave(state, column(4, 2, 7));
  const lanes = createModel(state).lanes;
  const laneW = ROAD_W / (2 * LANES);
  const centreX = (4 + 0.5) * T;
  for (const link of blocks(lanes)) {
    const x0 = link.pts[0];
    const z0 = link.pts[2];
    const z1 = link.pts[link.pts.length - 1];
    const northbound = z1 < z0;
    const expected = centreX + (northbound ? laneW / 2 : -laneW / 2);
    assert.ok(Math.abs(x0 - expected) < 1e-6,
      `${northbound ? "northbound" : "southbound"} lane at x=${x0}, expected ${expected}`);
  }
});

test("no link is shorter than a car", () => {
  // A link a car cannot fit on is a link a car sits half inside a junction on.
  const state = blank(12);
  // A tight grid: junctions two tiles apart, which is the shortest block a
  // player can draw and therefore the shortest link the graph can hold.
  pave(state, row(4, 2, 9), row(8, 2, 9), column(4, 2, 9), column(6, 2, 9));
  const lanes = createModel(state).lanes;
  for (const link of lanes.links) {
    assert.ok(link.len >= 4.5, `${link.kind} link ${link.id} is ${link.len.toFixed(2)} m long`);
  }
});

test("every point of a link has a height, and the arc lengths are its own", () => {
  const lanes = straight();
  for (const link of blocks(lanes)) {
    assert.equal(link.pts.length % 3, 0);
    assert.equal(link.cum.length, link.pts.length / 3);
    assert.equal(link.cum[0], 0);
    assert.ok(Math.abs(link.cum[link.cum.length - 1] - link.len) < 1e-6);
    for (let i = 0; i < link.cum.length; i += 1) {
      assert.ok(Number.isFinite(link.pts[i * 3 + 1]), "a lane point has no ground under it");
      if (i > 0) assert.ok(link.cum[i] > link.cum[i - 1], "arc length went backwards");
    }
  }
});

// --- the graph ---------------------------------------------------------------

test("every link has a successor unless it ends at the edge of the road", () => {
  const state = blank(12);
  pave(state, row(4, 2, 9), column(5, 2, 9));
  const lanes = createModel(state).lanes;
  for (const link of lanes.links) {
    if (link.exit) {
      assert.equal(link.next.length, 0, `exit link ${link.id} leads somewhere`);
      continue;
    }
    assert.ok(link.next.length > 0, `link ${link.id} (${link.kind}) is a dead end`);
  }
  assert.ok(lanes.links.some((l) => l.entry), "nothing spawns anywhere");
  assert.ok(lanes.links.some((l) => l.exit), "nothing leaves anywhere");
});

test("a successor starts where its predecessor ends", () => {
  // The one that teleports cars if it is wrong, and the one a screenshot of a
  // moving city cannot show you.
  const state = blank(12);
  pave(state, row(4, 2, 9), column(5, 2, 9));
  const lanes = createModel(state).lanes;
  const byId = new Map(lanes.links.map((l) => [l.id, l]));
  let checked = 0;
  for (const link of lanes.links) {
    const ex = link.pts[link.pts.length - 3];
    const ez = link.pts[link.pts.length - 1];
    for (const step of link.next) {
      const to = byId.get(step.link);
      const gap = Math.hypot(to.pts[0] - ex, to.pts[2] - ez);
      assert.ok(gap < 1e-6, `link ${link.id} → ${to.id} jumps ${gap.toFixed(3)} m`);
      checked += 1;
    }
  }
  assert.ok(checked > 4, `only ${checked} successors to check`);
});

test("preds is the reverse of next", () => {
  const state = blank(12);
  pave(state, row(4, 2, 9), column(5, 2, 9));
  const lanes = createModel(state).lanes;
  const byId = new Map(lanes.links.map((l) => [l.id, l]));
  for (const link of lanes.links) {
    for (const step of link.next) {
      assert.ok(byId.get(step.link).preds.includes(link.id),
        `${link.id} → ${step.link} is not recorded backwards`);
    }
  }
});

test("a T gives each approach a straight and a turn, and the stem two turns", () => {
  // Six connectors: N and S approaches get straight-plus-one-turn, the stem
  // gets left and right. An X would give twelve.
  const state = blank(12);
  pave(state, column(5, 2, 8), row(5, 6, 9));   // the stem leaves eastward from (5,5)
  const lanes = createModel(state).lanes;
  assert.equal(turns(lanes).length, 6, turns(lanes).map((t) => t.turn).join(", "));
  const kinds = turns(lanes).map((t) => t.turn).sort();
  assert.deepEqual(kinds, ["left", "left", "right", "right", "straight", "straight"]);
});

test("a crossroads gives every approach three ways out and no U-turn", () => {
  const state = blank(14);
  pave(state, row(6, 2, 10), column(6, 2, 10));
  const lanes = createModel(state).lanes;
  assert.equal(turns(lanes).length, 12, "an X is four approaches × three exits");
  for (const turn of turns(lanes)) {
    assert.notEqual(turn.turn, "u", "a U-turn is not a manoeuvre this city allows");
  }
});

// --- signals -----------------------------------------------------------------

// --- only a crossing of two streets gets a signal (slice T1, A51) -----------
//
// E1 signalled every node of kind `junction`, which is every node of degree
// three or more. V8 drew the heads and showed what that means on an ordinary
// city grid: a picket fence of traffic lights, four to a junction, every two to
// four tiles (Q67). Kjell: *"signals only where two real streets cross."*
//
// A node is signalled when two corridors of MORE THAN ONE TILE each cross it.
// Everything else — T-junctions, the crossings of one-tile stubs — is give-way.

test("a crossroads of two real streets is signalled", () => {
  const state = blank(12);
  pave(state, row(4, 2, 9), column(5, 2, 9));
  const model = createModel(state);
  const cross = model.nodes.find((n) => n.kind === "junction");
  assert.ok(cross, "the fixture has no crossroads");
  assert.equal(model.lanes.signals.has(cross.id), true);
});

test("a T-junction is give-way, not a signal", () => {
  // Three arms is not two streets crossing: the through road holds priority and
  // the stem waits for a gap.
  const state = blank(12);
  pave(state, row(4, 2, 9), column(5, 4, 9));
  const model = createModel(state);
  const tee = model.nodes.find((n) => n.degree === 3);
  assert.ok(tee, "the fixture has no T in it");
  assert.equal(model.lanes.signals.has(tee.id), false);
});

test("a crossroads with a one-tile stub on one axis is give-way", () => {
  // Four arms and only one real street: a driveway is not a street, and a light
  // that stops an arterial for one is worse than no light.
  const state = blank(14);
  pave(state, row(6, 2, 11), [[6, 5], [6, 7]]);
  const model = createModel(state);
  const node = model.nodes.find((n) => n.degree === 4);
  assert.ok(node, "the fixture has no four-arm node");
  assert.equal(model.lanes.signals.has(node.id), false);
});

test("nothing with fewer than three arms is ever signalled", () => {
  const state = blank(12);
  pave(state, row(4, 2, 9), column(5, 2, 9));
  const model = createModel(state);
  for (const node of model.nodes) {
    if (node.degree >= 3) continue;
    assert.equal(model.lanes.signals.has(node.id), false, `${node.kind} node ${node.id}`);
  }
});

test("the signal rule is one function, asked by everything that draws or obeys one", () => {
  // The heads (V8), the nav graph's crossings (E7) and the traffic all decide
  // whether a junction is signalled. Three copies of the rule is a light that
  // stands at a junction the cars drive straight through.
  const state = blank(12);
  pave(state, row(4, 2, 9), column(5, 2, 9));
  const model = createModel(state);
  for (const node of model.nodes) {
    assert.equal(isSignalled(node, model.corridors), model.lanes.signals.has(node.id),
      `node ${node.id} (${node.kind}, degree ${node.degree})`);
  }
});

test("a signal is periodic and never green both ways", () => {
  const state = blank(12);
  pave(state, row(4, 2, 9), column(5, 2, 9));
  const model = createModel(state);
  const node = model.nodes.find((n) => n.kind === "junction");
  const { phaseAt, signals } = model.lanes;
  const cycle = signals.get(node.id).cycle;
  const seen = new Set();
  for (let t = 0; t < cycle; t += 0.5) {
    const phase = phaseAt(node.id, t);
    seen.add(phase);
    assert.equal(phaseAt(node.id, t), phaseAt(node.id, t + cycle * 3), "the signal is not periodic");
  }
  assert.deepEqual([...seen].sort(), ["amber", "ew", "ns"], "a phase is missing");
});

test("the amber is three seconds, twice a cycle", () => {
  const state = blank(12);
  pave(state, row(4, 2, 9), column(5, 2, 9));
  const model = createModel(state);
  const node = model.nodes.find((n) => n.kind === "junction");
  const { phaseAt, signals } = model.lanes;
  const cycle = signals.get(node.id).cycle;
  let amber = 0;
  const step = 0.05;
  for (let t = 0; t < cycle; t += step) if (phaseAt(node.id, t) === "amber") amber += step;
  assert.ok(Math.abs(amber - 6) < 0.2, `${amber.toFixed(2)} s of amber in a ${cycle} s cycle`);
});

test("two junctions do not change together", () => {
  // The offset is a hash of the tile, so a grid does not pulse in unison.
  const state = blank(16);
  pave(state, row(4, 2, 12), row(8, 2, 12), column(5, 2, 12), column(9, 2, 12));
  const model = createModel(state);
  const offsets = [...model.lanes.signals.values()].map((s) => s.offset);
  assert.ok(offsets.length >= 4, `${offsets.length} junctions`);
  assert.ok(new Set(offsets.map((o) => Math.round(o))).size > 1, "every signal shares an offset");
});

// --- sampling ----------------------------------------------------------------

test("sampling a link at its ends returns its ends", () => {
  const lanes = straight();
  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  for (const link of blocks(lanes)) {
    lanes.sample(link, 0, out);
    assert.ok(Math.abs(out.x - link.pts[0]) < 1e-6 && Math.abs(out.z - link.pts[2]) < 1e-6);
    lanes.sample(link, link.len, out);
    const n = link.pts.length;
    assert.ok(Math.abs(out.x - link.pts[n - 3]) < 1e-6 && Math.abs(out.z - link.pts[n - 1]) < 1e-6);
  }
});

test("sampling is monotonic along the link and gives a unit tangent", () => {
  const lanes = straight();
  const link = blocks(lanes)[0];
  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  let previous = -Infinity;
  for (let s = 0; s <= link.len; s += link.len / 20) {
    lanes.sample(link, s, out);
    const along = out.x * (link.pts[link.pts.length - 3] - link.pts[0]) >= 0 ? out.x : -out.x;
    assert.ok(along >= previous - 1e-6, "sampling went backwards");
    previous = along;
    assert.ok(Math.abs(Math.hypot(out.tx, out.tz) - 1) < 1e-6, "the tangent is not a unit vector");
  }
});

test("sampling past the end clamps rather than running off", () => {
  const lanes = straight();
  const link = blocks(lanes)[0];
  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  lanes.sample(link, link.len * 3, out);
  const n = link.pts.length;
  assert.ok(Math.abs(out.x - link.pts[n - 3]) < 1e-6);
  lanes.sample(link, -10, out);
  assert.ok(Math.abs(out.x - link.pts[0]) < 1e-6);
});

// --- the model ---------------------------------------------------------------

test("an empty map has an empty lane graph rather than no lane graph", () => {
  const lanes = createModel(blank()).lanes;
  assert.deepEqual(lanes.links, []);
  assert.equal(lanes.signals.size, 0);
});

test("the lane graph is a function of state, like the rest of the model", () => {
  const state = blank(12);
  pave(state, row(4, 2, 9), column(5, 2, 9));
  const a = createModel(state).lanes;
  const b = createModel(state).lanes;
  assert.equal(a.links.length, b.links.length);
  for (let i = 0; i < a.links.length; i += 1) {
    assert.deepEqual([...a.links[i].pts], [...b.links[i].pts], `link ${i} differs between two derivations`);
  }
});

test("the road's lane numbers are in data, not in the code", () => {
  const road = getConfig().road;
  for (const key of ["lanes", "stopLine", "speed", "maxDensity"]) {
    assert.ok(Number.isFinite(road[key]), `road.${key} is not a number`);
  }
  assert.ok(road.stopLine * 2 < DEFAULTS.tileM, "the stop lines meet in the middle of a tile");
});

// --- the lane sits on the road it is drawn on (slice R4) ---------------------
//
// R2 gave the lane graph the corridor's own centreline profile instead of a
// `heightAt` per lane point, which took the model rebuild from 80 ms to 53.7 ms.
// It mapped a lane's own fraction of length onto the profile — and a lane with
// `dir === 1` runs the corridor BACKWARDS, so it read the profile mirrored: the
// lane's start, at the corridor's far end, took the near end's height.
//
// Measured by the reviewer on the saturated 96×96 with buildings off, comparing
// every packed lane point's `y` against `model.heightAt(x, z)` under it
// (era: `ed96699`):
//
//   | links            | points | mean error | over 0.5 m | worst   |
//   | block, dir 0     |  3,742 | 0.05 m     |      0     |  0.44 m |
//   | block, dir 1     |  3,742 | 1.79 m     |  2,540     | 12.44 m |
//   | turns            | 29,848 | —          | —          | 12.44 m |
//
// Half the traffic in the city was posed against the wrong end of its street.
// Nothing saw it: `budget_gate` counts triangles, `walkthrough` never looks at
// a car, and the streets the screenshots were taken on are nearly flat.
//
// After R4 (`tools/lanes_dump.mjs` prints these every run):
//
//   | block, dir 0     |  3,742 | 0.00 m     |      0     |  0.11 m |
//   | block, dir 1     |  3,742 | 0.00 m     |      0     |  0.11 m |
//   | turns            | 29,848 | 0.00 m     |      0     |  0.25 m |
//
// Two fixes, not one. The mirror is the mapping by ARC LENGTH along the
// corridor, using the `s0` and `dirSign` the link already recorded for E7. The
// residual — 0.7 m near every junction once the mirror was gone — is that
// `profileOf` was re-sampling `heightAt` at the corridor's own twenty-metre
// points, which interpolates straight across the level junction box R3 put at
// each end. It reads R3's graded profile itself now.

/** A road that climbs: elevation rises `step` per tile eastward. */
function ramp(size = 10, step = 8) {
  const state = blank(size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) state.tiles.elevation[tileAt(size, x, y)] = x * step;
  }
  return state;
}

/** How far every packed point of every block link is from the ground under it. */
function laneErrors(model) {
  const out = [];
  for (const link of model.lanes.links) {
    if (link.kind !== "block") continue;
    for (let i = 0; i < link.cum.length; i += 1) {
      const x = link.pts[i * 3];
      const y = link.pts[i * 3 + 1];
      const z = link.pts[i * 3 + 2];
      out.push({ link, i, error: Math.abs(y - model.heightAt(x, z)) });
    }
  }
  return out;
}

test("a lane running against its corridor is not the corridor read backwards", () => {
  // The whole of R4 item 1. A street whose two ends differ by ten metres: the
  // lane going up it and the lane going down it must both start on the ground.
  const state = ramp();
  pave(state, row(4, 2, 7));
  const model = createModel(state);
  const links = model.lanes.links.filter((l) => l.kind === "block");
  assert.equal(links.length, 2, `${links.length} block links on one street`);
  const rise = Math.abs(model.heightAt(7.5 * T, 4.5 * T) - model.heightAt(2.5 * T, 4.5 * T));
  assert.ok(rise > 9, `the fixture only climbs ${rise.toFixed(1)} m`);
  for (const link of links) {
    const y = link.pts[1];
    const ground = model.heightAt(link.pts[0], link.pts[2]);
    assert.ok(Math.abs(y - ground) < 0.1,
      `dir ${link.dir} starts ${(y - ground).toFixed(2)} m off the ground`);
  }
});

test("no lane point anywhere is off the ground it is drawn on", () => {
  const state = ramp(12, 6);
  pave(state, row(4, 1, 10), column(6, 1, 10));
  const model = createModel(state);
  const errors = laneErrors(model);
  assert.ok(errors.length > 20, `only ${errors.length} lane points to check`);
  const worst = errors.reduce((a, b) => (b.error > a.error ? b : a));
  assert.ok(worst.error < 0.1,
    `a dir ${worst.link.dir} lane point is ${worst.error.toFixed(2)} m off the ground`);
});

test("both directions of one street agree about its height", () => {
  // The two lanes are the same tarmac seen twice. Sampling one at `s` and the
  // other at `len - s` has to give the same height, or the street has two
  // surfaces and half the cars drive on the wrong one.
  const state = ramp();
  pave(state, row(4, 2, 7));
  const model = createModel(state);
  const [a, b] = model.lanes.links.filter((l) => l.kind === "block");
  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  for (let f = 0.1; f <= 0.9; f += 0.1) {
    model.lanes.sample(a, a.len * f, out);
    const up = out.y;
    model.lanes.sample(b, b.len * (1 - f), out);
    assert.ok(Math.abs(up - out.y) < 0.15,
      `at ${(f * 100).toFixed(0)}% the two lanes are ${Math.abs(up - out.y).toFixed(2)} m apart`);
  }
});

test("a lane still climbs its street rather than being flattened onto one end", () => {
  const state = ramp();
  pave(state, row(4, 2, 7));
  const model = createModel(state);
  for (const link of model.lanes.links.filter((l) => l.kind === "block")) {
    const first = link.pts[1];
    const last = link.pts[(link.cum.length - 1) * 3 + 1];
    assert.ok(Math.abs(last - first) > 5, `a lane that climbs ${Math.abs(last - first).toFixed(1)} m`);
  }
});

test("the trimmed lane maps onto the part of the corridor it actually covers", () => {
  // The `dir 0` residual the review also measured (0.44 m worst): the lane's
  // `0..1` was stretched over the WHOLE corridor rather than over the piece
  // between the two stop lines, so a point a few metres into the ramp read the
  // flat junction box at the end of it.
  const state = ramp(12, 6);
  pave(state, row(4, 1, 10), column(6, 1, 10));
  const model = createModel(state);
  const errors = laneErrors(model).filter((e) => e.link.dir === 0);
  const worst = errors.reduce((a, b) => (b.error > a.error ? b : a));
  assert.ok(worst.error < 0.1, `dir 0 is still ${worst.error.toFixed(2)} m out`);
});

// --- the avenue (T1b) --------------------------------------------------------
//
// A second road kind with two lanes each way round a median. Every number here
// is arithmetic a screenshot cannot check: a lane inside the median, a lane
// index that lets the kerbside car turn left across the one beside it, or a
// taper at the seam that steps sideways instead of merging.

/** Sets the kind bit on tiles that are already paved. After `pave`, never
 * before: recomputing the masks writes `NET_PRESENT | mask` over the tile. */
function widen(state, ...groups) {
  for (const [x, y] of groups.flat()) state.tiles.road[tileAt(state.width, x, y)] |= NET_AVENUE;
}

const AVENUE = DEFAULTS.road.avenue;
const LANE_W = (AVENUE.width / 2 - AVENUE.median / 2) / AVENUE.lanes;

test("an avenue corridor is two lanes each way, offset round its median", () => {
  const state = blank();
  pave(state, column(4, 2, 7));
  widen(state, column(4, 2, 7));
  const lanes = createModel(state).lanes;
  assert.equal(blocks(lanes).length, 4, "two lanes each way is four block links");
  const centreX = (4 + 0.5) * T;
  const seen = new Map();
  for (const link of blocks(lanes)) {
    const northbound = link.pts[link.pts.length - 1] < link.pts[2];
    const offset = (link.pts[0] - centreX) * (northbound ? 1 : -1);
    // Right-hand traffic: the offset is to the right whichever way you drive.
    assert.ok(offset > 0, `a lane ${offset.toFixed(2)} m to the LEFT of the centre line`);
    const want = AVENUE.median / 2 + LANE_W * (link.index + 0.5);
    assert.ok(Math.abs(offset - want) < 1e-6,
      `lane ${link.index} at ${offset.toFixed(2)} m, expected ${want}`);
    assert.equal(link.of, 2);
    seen.set(`${northbound}:${link.index}`, true);
  }
  assert.equal(seen.size, 4, "the four lanes are not two lanes drawn twice");
  // Nothing is inside the median, and nothing is over the kerb.
  assert.ok(AVENUE.median / 2 + LANE_W * 0.5 > AVENUE.median / 2);
  assert.ok(AVENUE.median / 2 + LANE_W * 1.5 + LANE_W / 2 <= AVENUE.width / 2 + 1e-9);
});

test("at a junction the kerbside lane turns right and the inner one turns left", () => {
  // The rule a driver knows. Without it a car in the outer lane cuts across
  // the one beside it to make a left, which is the manoeuvre the conflict
  // table cannot save anyone from.
  const state = blank(12);
  pave(state, column(4, 2, 9), row(5, 2, 7));
  widen(state, column(4, 2, 9));
  const lanes = createModel(state).lanes;
  const node = lanes.nodes.find((n) => n.kind === "junction");
  assert.ok(node, "no junction");
  const byId = new Map(lanes.links.map((l) => [l.id, l]));
  const arriving = blocks(lanes).filter((l) => l.to === node.id && l.of === 2);
  assert.equal(arriving.length, 4, "an avenue arrives on two arms, two lanes each");
  for (const link of arriving) {
    const turns = link.next.map((step) => byId.get(step.link).turn);
    assert.ok(turns.includes("straight"), `lane ${link.index} cannot go straight on`);
    if (link.index === 0) {
      assert.ok(turns.includes("left"), "the inner lane cannot turn left");
      assert.ok(!turns.includes("right"), "the inner lane turns right across the kerbside one");
    } else {
      assert.ok(turns.includes("right"), "the kerbside lane cannot turn right");
      assert.ok(!turns.includes("left"), "the kerbside lane turns left across the inner one");
    }
  }
  // And a car turning INTO the avenue arrives in the right half of it: a right
  // turn into the kerbside lane, a left into the inner one.
  for (const link of blocks(lanes).filter((l) => l.to === node.id && l.of === 1)) {
    for (const step of link.next) {
      const turn = byId.get(step.link);
      const into = byId.get(turn.next[0].link);
      if (into.of !== 2) continue;
      assert.equal(into.index, turn.turn === "right" ? 1 : 0,
        `a ${turn.turn} arrived in lane ${into.index}`);
    }
  }
});

test("where an avenue becomes a street the lanes taper rather than step sideways", () => {
  const state = blank(12);
  pave(state, column(4, 2, 9));
  widen(state, column(4, 2, 5));
  const model = createModel(state);
  assert.equal(model.corridors.length, 2, "a run that changes kind is two corridors");
  const seam = model.nodes.find((n) => n.kind === "seam");
  assert.ok(seam, "no seam node where the avenue ends");
  assert.equal(seam.tile % state.width, 4);
  const lanes = model.lanes;
  const byId = new Map(lanes.links.map((l) => [l.id, l]));
  // Every lane on either side of the seam leads somewhere, and the kerbside
  // one crosses the width of a lane to get there over a taper, not a step.
  const into = blocks(lanes).filter((l) => l.to === seam.id);
  assert.equal(into.length, 3, "two avenue lanes and one street lane arrive at the seam");
  for (const link of into) {
    // Two avenue lanes MERGE into the one street lane; the one street lane
    // DIVERGES into two. Either way nothing arrives at the seam and stops.
    assert.equal(link.next.length, link.of === 2 ? 1 : 2,
      `lane ${link.index} of ${link.of} at the seam leads ${link.next.length} ways`);
    for (const step of link.next) {
      const connector = byId.get(step.link);
      assert.ok(connector.len > T / 2, `a ${connector.len.toFixed(1)} m taper is a step sideways`);
      const sideways = Math.abs(connector.pts[connector.pts.length - 3] - connector.pts[0]);
      const other = byId.get(connector.next[0].link);
      if (Math.max(link.index, other.index) === 1) {
        assert.ok(sideways > LANE_W / 2, "the kerbside lane did not merge at all");
      }
    }
  }
  // And the single street lane feeds BOTH avenue lanes, or one of them would
  // start in the middle of the street with nothing behind it.
  const street = blocks(lanes).find((l) => l.of === 1 && l.from === seam.id);
  assert.ok(street, "no street lane leaves the seam");
  const fed = blocks(lanes).filter((l) => l.of === 2 && l.from === seam.id);
  assert.equal(fed.length, 2);
  for (const lane of fed) assert.ok(lane.preds.length > 0, `avenue lane ${lane.index} has nothing behind it`);
});

// --- every link holds the car that drives on it (slice J2; A109, Q138) -------

test("a corridor shorter than its own junction boxes still yields a usable link", () => {
  // Q138: the deputy lays streets that meet two metres apart, so a corridor can
  // be shorter than the clearances its two junctions ask for — and the block
  // link that came out of it was **2.00 m against a 4.6 m van**. The 20 m grid
  // the fixture used until H7 could not produce one, which is why the gate's
  // criterion was a minimum and why it went red the moment the fixture became a
  // city.
  //
  // The link is not dropped: that would leave the two junctions with no way
  // between them and a hole in the graph. The clearances give way instead.
  // Two crossroads one tile apart: the corridor between them is 20 m long and
  // asks for more clearance than that at each end.
  const state = blank(16);
  pave(state,
    Array.from({ length: 12 }, (_, i) => [2 + i, 6]),
    Array.from({ length: 8 }, (_, i) => [6, 2 + i]),
    Array.from({ length: 8 }, (_, i) => [7, 2 + i]));
  const model = createModel(state);
  const blocks = model.lanes.links.filter((link) => link.kind === "block");
  assert.ok(blocks.length > 0, "no block links at all, so this proves nothing");
  const short = blocks.filter((link) => link.len < LONGEST_BODY - 1e-6);
  assert.deepEqual(short.map((link) => `${link.id}:${link.len.toFixed(2)}m`), [],
    "a link shorter than the longest thing that drives on it");
});

test("the short corridor is still connected at both ends", () => {
  // The thing that would quietly break: a link that keeps its length by giving
  // up its clearances must still JOIN. A graph with a hole in it is worse than
  // a link a car overhangs.
  const state = blank(16);
  pave(state,
    Array.from({ length: 12 }, (_, i) => [2 + i, 6]),
    Array.from({ length: 8 }, (_, i) => [6, 2 + i]),
    Array.from({ length: 8 }, (_, i) => [7, 2 + i]));
  const model = createModel(state);
  const blocks = model.lanes.links.filter((link) => link.kind === "block");
  const orphans = blocks.filter((link) => link.next.length === 0 && link.preds.length === 0);
  assert.deepEqual(orphans.map((link) => link.id), [], "block links joined to nothing at either end");
});


// --- the bridge (slice S13, A84) ----------------------------------------------

test("a lane crosses water as ONE corridor, on the deck rather than in the river", () => {
  // Water is not a break in the road: `deriveCorridors` walks the road layer
  // and nothing in it asks about terrain, so the crossing has always been one
  // corridor. What was wrong was its HEIGHT — the profile was clamped to the
  // water's surface, so a car drove along the waterline and the banks were
  // steps. The lanes read the corridor's profile (R4), which is now graded
  // against the deck.
  const state = blank(16);
  state.tiles.elevation.fill(40);
  for (let y = 6; y <= 9; y += 1) {
    for (let x = 4; x <= 9; x += 1) {
      const i = tileAt(state.width, x, y);
      state.tiles.terrain[i] = 3;
      state.tiles.elevation[i] = 30;
    }
  }
  pave(state, row(7, 1, 14));
  const model = createModel(state);
  assert.equal(model.corridors.length, 1, `the crossing is ${model.corridors.length} corridors`);
  const level = model.waterLevelAt(7.5 * T, 7.5 * T);
  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  let overWater = 0;
  let submerged = 0;
  for (const link of model.lanes.links) {
    if (link.kind !== "block") continue;
    for (let f = 0; f <= 1; f += 0.02) {
      model.lanes.sample(link, link.len * f, out);
      const tile = Math.floor(out.z / T) * state.width + Math.floor(out.x / T);
      if (!model.water.isWater(tile)) continue;
      overWater += 1;
      if (out.y < level + 1) submerged += 1;
    }
  }
  assert.ok(overWater > 10, `only ${overWater} lane samples are over the water at all`);
  assert.equal(submerged, 0, `${submerged} of ${overWater} lane samples over water are at the waterline`);
});

// --- the dirty set (W6b) -----------------------------------------------------
//
// `deriveLanes(state, network, ground, previous)` reuses the lanes, links and
// turns of every corridor the build did not touch. The whole slice rests on one
// claim — that the graph it produces is the graph a full derivation produces —
// and the only honest way to hold it is to derive both and compare them link
// for link, by KEY, on several shapes of build.

/** Every link by key, with the fields a car actually reads. */
function shapeOf(lanes) {
  const byKey = new Map(lanes.links.map((l) => [l.key, l]));
  const out = new Map();
  for (const link of lanes.links) {
    out.set(link.key, {
      kind: link.kind,
      dir: link.dir,
      index: link.index,
      of: link.of,
      turn: link.turn,
      axis: link.axis,
      entry: link.entry,
      exit: link.exit,
      s0: link.s0,
      dirSign: link.dirSign,
      len: Number(link.len.toFixed(9)),
      pts: [...link.pts].map((v) => Number(v.toFixed(9))).join(","),
      // Adjacency as KEYS: ids are array indices and the two derivations
      // number them differently, which is the whole reason keys exist.
      next: link.next.map((step) => `${byKey.get(lanes.links[step.link].key) ? lanes.links[step.link].key : "?"}:${step.turn}`).sort(),
      preds: link.preds.map((id) => lanes.links[id].key).sort(),
      conflicts: (lanes.conflicts.get(link.id) ?? []).map((id) => lanes.links[id].key).sort(),
    });
  }
  return out;
}

function sameGraph(a, b, what) {
  const full = shapeOf(a);
  const incremental = shapeOf(b);
  assert.deepEqual([...incremental.keys()].sort(), [...full.keys()].sort(),
    `${what}: the two derivations do not even hold the same links`);
  for (const [key, expected] of full) {
    assert.deepEqual(incremental.get(key), expected, `${what}: link ${key} came out differently`);
  }
  assert.deepEqual([...b.signals.keys()].map((id) => id).sort(), [...a.signals.keys()].sort(),
    `${what}: the signals moved`);
}

/** A town with junctions, bends, ends and a long run — and lots, so the ground
 * has something to blend against. */
function laneTown(size = 40) {
  const state = blank(size);
  pave(state,
    row(6, 2, 36), row(14, 2, 36), row(22, 4, 32), row(30, 6, 30),
    column(4, 6, 22), column(13, 6, 30), column(22, 6, 30), column(31, 6, 22), column(36, 6, 14));
  return state;
}

test("an incremental lane graph is the same graph as a full one (W6b)", () => {
  const builds = {
    "a tile that extends a street": (state) => pave(state, [[37, 14]]),
    "a tile that splits a street": (state) => pave(state, [[9, 15]]),
    "a whole new street": (state) => pave(state, row(10, 4, 32)),
    "a street removed": (state) => {
      for (const [x, y] of row(22, 4, 32)) state.tiles.road[tileAt(state.width, x, y)] = 0;
      pave(state);   // re-mask what is left
    },
    "an avenue through the middle": (state) => {
      for (const [x, y] of row(14, 2, 36)) {
        state.tiles.road[tileAt(state.width, x, y)] |= NET_AVENUE;
      }
      pave(state);
    },
  };

  for (const [what, build] of Object.entries(builds)) {
    const state = laneTown();
    const before = createModel(state);
    build(state);

    // The reference: a model that has never seen the one before it.
    const full = createModel(state).lanes;
    // The same thing, told what it used to be.
    const incremental = createModel(state, before).lanes;
    sameGraph(full, incremental, what);
    // Enough graph that the comparison means something: this town is nine
    // streets, so it has junctions, bends, ends, a split and ~180 links.
    assert.ok(full.links.length > 150, `${what}: only ${full.links.length} links, so this proves little`);
  }
});

test("the dirty set actually reuses something, and says how much (W6b)", () => {
  // A test that cannot tell reuse from a full re-derivation is a test of the
  // equality above and nothing else.
  const state = laneTown();
  const before = createModel(state);
  pave(state, [[37, 14]]);
  const after = createModel(state, before);
  const reused = after.lanes.stats.reused ?? 0;
  const derived = after.lanes.stats.derived ?? 0;
  assert.ok(reused > 0, "nothing was reused");
  assert.ok(derived > 0, "nothing was re-derived, so the build changed nothing and this proves little");
  assert.ok(reused / (reused + derived) > 0.9,
    `only ${reused} of ${reused + derived} corridors were reused`);
});

test("a model with no previous is a full derivation (W6b)", () => {
  const state = laneTown();
  const fresh = createModel(state);
  assert.equal(fresh.lanes.stats.reused ?? 0, 0, "a first derivation reused something that does not exist");
  // And a previous from a DIFFERENT city reuses nothing, rather than reusing
  // something that happens to share a key.
  const other = createModel(blank(40));
  const built = createModel(state, other);
  assert.equal(built.lanes.stats.reused ?? 0, 0);
  sameGraph(fresh.lanes, built.lanes, "a previous from another city");
});

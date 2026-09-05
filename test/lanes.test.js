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
import { NET_PRESENT } from "../client/constants-mirror.js";
import { DEFAULTS, getConfig } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";

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

test("only a junction gets a signal", () => {
  const state = blank(12);
  pave(state, row(4, 2, 9), column(5, 2, 9));
  const model = createModel(state);
  for (const node of model.nodes) {
    const signalled = model.lanes.signals.has(node.id);
    assert.equal(signalled, node.kind === "junction", `${node.kind} node ${node.id}`);
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

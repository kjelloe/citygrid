// The level-of-detail budget.
//
// The budget is the promise that a phone can draw this city. What is tested
// here is the policy: that detail nobody can see is dropped whatever the
// budget allows, that the budget is honoured when it can be, and that the
// order things are sacrificed in is the one the design chose.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import {
  TIER, choosePlan, estimate, stepDown, ladderLength, tilePixels,
  visibleBounds, inBounds, setBudget, getBudget, setCosts, getCosts,
  countScene, markingInstances,
} from "../client/render/lod.js";

/** A tiny hand-built state, enough for countScene to walk. */
const SAMPLE = {
  width: 4,
  height: 4,
  buildings: [],
  tiles: {
    terrain: new Uint8Array(16),
    road: new Uint8Array(16),
    wire: new Uint8Array(16),
    pipe: new Uint8Array(16),
    buildingId: new Uint16Array(16),
    elevation: new Uint8Array(16),
  },
};

/** A city big enough that the budget actually bites. */
const CITY = {
  buildings: 900, trees: 1200, props: 4000, roads: 4400, poles: 600, groundChunks: 64,
  // A downtown grid: most road tiles are straight, a few hundred are junctions.
  markArms: 5200, wireTiles: 600, wireArms: 1100, pipeTiles: 600, pipeArms: 1100,
};

function planAt(px, budget = 80000, counts = CITY) {
  return choosePlan(counts, { span: 1 }, px, { tilePixels: px, budget });
}

test("the budget is configurable and survives a round trip", () => {
  const original = getBudget();
  setBudget(120000);
  assert.equal(getBudget(), 120000);
  setBudget(-5);
  assert.equal(getBudget(), 1000, "a budget below the floor is clamped, not accepted");
  setBudget(original);
});

test("tile pixels come from the span, not from distance", () => {
  // Orthographic: there is no foreshortening, so zoom is the only thing that
  // decides whether detail is resolvable.
  assert.equal(tilePixels({ span: 20 }, 720), 36);
  assert.equal(tilePixels({ span: 40 }, 720), 18);
  assert.equal(tilePixels({ span: 0 }, 720), 0, "a zero span must not divide by zero");
});

test("detail nobody can see is dropped whatever the budget allows", () => {
  // A budget of ten million still must not draw window sills at five pixels a
  // tile. Resolvability is not a trade-off.
  const rich = planAt(5, 10_000_000);
  assert.equal(rich.props, false);
  assert.equal(rich.markings, false);
  assert.equal(rich.trees, false);
  assert.equal(rich.buildings, TIER.BLOCK);
});

test("a generous budget keeps full detail when it is resolvable", () => {
  const plan = planAt(60, 10_000_000);
  assert.equal(plan.buildings, TIER.FULL);
  assert.equal(plan.props, true);
  assert.equal(plan.shadows, true);
});

test("a tight budget is met by stepping down", () => {
  const plan = planAt(60, 120000);
  assert.ok(plan.estimate <= 120000, `estimate ${plan.estimate} exceeds the budget`);
  assert.equal(plan.overBudget, false);
  assert.ok(plan.props === false || plan.buildings < TIER.FULL, "something should have been given up");
});

test("props are sacrificed before buildings", () => {
  // The order is the design's, not an accident: a city of boxes with grass
  // tufts would be the wrong trade. Sized so the budget lands mid-ladder,
  // which is the only place the order is observable.
  const town = {
    buildings: 200, trees: 300, props: 800, roads: 900, poles: 100, groundChunks: 9,
    markArms: 1000, wireTiles: 100, wireArms: 180, pipeTiles: 100, pipeArms: 180,
  };
  const plan = planAt(60, 200000, town);
  assert.equal(plan.props, false, "props go first");
  assert.equal(plan.buildings, TIER.FULL, "buildings keep their detail while props are being dropped");
});

test("terrain sets a floor the ladder cannot go below", () => {
  // Worth stating plainly: ground is not optional and has no tiers, so on a
  // fully built 128x128 region the cheapest possible frame is still tens of
  // thousands of triangles. That is why the default budget is 80k, not 40k.
  //
  // ROADS are no longer part of that floor. They were, at 12 triangles a tile,
  // because N28 gave them a skirt; N30 paints them into the terrain mesh,
  // where they are seamless and free (P35).
  const floor = planAt(60, 1000);
  assert.ok(floor.estimate > 25000, `the floor came out at ${floor.estimate}`);
  assert.equal(floor.overBudget, true);
});

test("the ladder terminates instead of looping forever", () => {
  const plan = planAt(60, 1000);
  let steps = 0;
  while (stepDown(plan)) {
    steps += 1;
    assert.ok(steps <= ladderLength(), "stepDown never returned false");
  }
  assert.equal(plan.trees, false);
  assert.equal(plan.buildings, TIER.BLOCK);
});

test("an impossible budget is reported, not silently missed", () => {
  // Terrain and roads are not optional, so below some budget the city cannot
  // be drawn at all. Saying so is better than pretending.
  const plan = planAt(60, 1000);
  assert.equal(plan.overBudget, true, "an unmeetable budget must be flagged");
});

test("a block tree is not free", () => {
  // It was priced at zero, and 900 trees at zero each is how a 27,000-triangle
  // hole opened between the estimate and what was actually drawn.
  assert.ok(getCosts().tree[TIER.BLOCK] > 0, "a tier-0 tree still has geometry");
});

test("the estimate does NOT charge twice for a shadowed caster (P35)", () => {
  // It did, and that was right when it was written: a shadow pass redraws every
  // caster and the actual came out at 2× the estimate (ruling 019). It is not
  // right now. Measured on the real page, toggling `shadowMap.enabled` moves
  // `renderer.info.render.triangles` by exactly zero — three resets the counter
  // after the shadow pass — and that counter is what the budget IS. Charging
  // twice against a number that only counts once put the estimate 92% over the
  // truth at close zoom, and the ladder dropped the props you zoomed in to see.
  const counts = {
    buildings: 100, trees: 0, props: 0, roads: 0, poles: 0, groundChunks: 0,
    markArms: 0, wireTiles: 0, wireArms: 0, pipeTiles: 0, pipeArms: 0,
  };
  const base = { buildings: TIER.FULL, treeDetail: TIER.FULL, trees: false, props: false, markings: false, poles: false };
  const lit = estimate(counts, { ...base, shadows: false });
  const shadowed = estimate(counts, { ...base, shadows: true });
  assert.equal(shadowed, lit, "the estimate still doubles for a pass the counter cannot see");
});

test("visible bounds cover the view at every yaw", () => {
  // The bounds are axis-aligned but the view rotates, so they have to cover the
  // diagonal or buildings pop in at the corners when the camera turns.
  const view = { span: 40, targetX: 50, targetZ: 50 };
  const bounds = visibleBounds(view, 16 / 9);
  const halfDiagonal = Math.hypot(20 * (16 / 9), 20);
  assert.ok(bounds.x1 - view.targetX >= halfDiagonal, "the bounds must cover a rotated view");
  assert.ok(inBounds(bounds, 50, 50));
  assert.ok(!inBounds(bounds, 500, 500));
});

test("counting only what is on screen is what makes the budget mean anything", () => {
  const wide = choosePlan({ ...CITY, groundChunks: 64 }, { span: 1 }, 60, { tilePixels: 60, budget: 80000 });
  const narrow = choosePlan({ ...CITY, buildings: 20, trees: 10, props: 40, roads: 60, poles: 5, groundChunks: 4 },
    { span: 1 }, 60, { tilePixels: 60, budget: 80000 });
  assert.ok(narrow.estimate < wide.estimate);
  assert.equal(narrow.props, true, "a zoomed-in view has room for the detail it can actually show");
});

test("a low camera sees further, and the bounds have to know it (P34)", () => {
  // The pitch used to be a constant. Now that the right mouse button can drop
  // the camera towards the ground (ruling 006, amended), the ground footprint
  // of an orthographic frustum stretches by 1/sin(pitch) along the view — at
  // 20° that is nearly three times as far. Bounds that ignore it cull the
  // distance away and the city ends at a straight line across the screen.
  const overhead = { span: 40, targetX: 50, targetZ: 50, pitch: Math.PI / 2 };
  const low = { span: 40, targetX: 50, targetZ: 50, pitch: 20 * (Math.PI / 180) };
  const reach = (view) => visibleBounds(view, 16 / 9).x1 - view.targetX;
  assert.ok(reach(low) > reach(overhead) * 1.5,
    `a 20° camera reaches ${reach(low).toFixed(1)} against ${reach(overhead).toFixed(1)} overhead`);
  // A view with no pitch at all still gets the old answer rather than NaN.
  assert.ok(Number.isFinite(reach({ span: 40, targetX: 0, targetZ: 0 })));
});

test("the estimate charges for every network the renderer draws (P35)", () => {
  // `counts.poles` was computed and never used, and wire, pipe and their arms
  // were not counted at all. A term that is missing from the estimate is a
  // term the budget cannot trade away.
  const source = readFileSync(join(repoRoot, "client", "render", "lod.js"), "utf8");
  const body = source.slice(source.indexOf("export function estimate("), source.indexOf("export function stepDown") >= 0
    ? source.indexOf("export function stepDown") : source.length);
  for (const term of ["wireTiles", "wireArms", "pipeTiles", "pipeArms", "markArms"]) {
    assert.ok(body.includes(term), `the estimate ignores ${term}`);
  }
  const counted = countScene(SAMPLE, undefined);
  for (const key of ["wireTiles", "wireArms", "pipeTiles", "pipeArms", "markArms"]) {
    assert.ok(Number.isFinite(counted[key]), `countScene does not report ${key}`);
  }
});

test("a junction's markings are counted, not assumed to be one", () => {
  // One centred dash on a straight run, two arms at a corner, three or four at
  // a junction (slice N29). Charging one a tile understates a downtown grid by
  // most of its markings.
  assert.equal(markingInstances(0), 0, "a lone road tile draws a marking");
  assert.equal(markingInstances(1), 0, "a dead end draws a marking");
  assert.equal(markingInstances(5), 1, "a straight run is not one dash");
  assert.equal(markingInstances(10), 1, "a straight run is not one dash");
  assert.equal(markingInstances(3), 2, "a corner is not two arms");
  assert.equal(markingInstances(7), 3, "a T junction is not three arms");
  assert.equal(markingInstances(15), 4, "an X junction is not four arms");
});

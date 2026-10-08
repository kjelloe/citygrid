// Where a street's shoulder is a wall (S18, Q145 → A128).
//
// The decision is pure and lives in `client/world/`, so a hillside can be a
// function rather than a city: the geometry it produces is `streets-l3.js`'s
// business, and the picture is `tools/embankment_shots.mjs` — which stands the
// photo camera three metres off the face, because nothing else could see one.

import test from "node:test";
import assert from "node:assert/strict";
import { retainingRuns, wallRuns } from "../client/world/retaining.js";
import { DEFAULTS, setConfig } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { saturatedCity } from "../tools/lib/saturated.mjs";

setConfig(DEFAULTS);

/** A line of points along z, which is what a kerbside run looks like. */
const line = (n, step = 4) => Array.from({ length: n }, (unused, i) => ({ x: 0, z: i * step }));

test("flat ground wants no wall", () => {
  const pts = line(6);
  const flat = pts.map(() => 30);
  assert.deepEqual(retainingRuns(pts, flat, flat), []);
});

test("a drop smaller than the kerb it already has wants no wall", () => {
  // The kerb is 0.15 m and the pavement stands on it: a wall for every kerb in
  // the city is a city made of walls.
  const pts = line(6);
  assert.deepEqual(retainingRuns(pts, pts.map(() => 30), pts.map(() => 29.4), { minDrop: 1.2 }), []);
});

test("a street standing on fill gets one wall, as deep as the fill", () => {
  const pts = line(6);
  const runs = retainingRuns(pts, pts.map(() => 30), pts.map(() => 22));
  assert.equal(runs.length, 1, "the wall was cut into pieces");
  assert.equal(runs[0].points.length, 6);
  for (const drop of runs[0].drops) assert.equal(drop, 8);
});

test("the wall runs where the fill is and stops where it is not", () => {
  // Half a street on an embankment: one run, ending at the point where the
  // ground comes back up — included, so the face closes against the land
  // rather than stopping a span early.
  const pts = line(8);
  const runs = retainingRuns(pts, pts.map(() => 30), pts.map((p) => (p.z < 12 ? 20 : 30)));
  assert.equal(runs.length, 1);
  assert.equal(runs[0].points.length, 4, `ran ${runs[0].points.length} points`);
  assert.deepEqual(runs[0].drops, [10, 10, 10, 0]);
});

test("two embankments on one line are two walls", () => {
  const pts = line(8);
  const runs = retainingRuns(pts, pts.map(() => 30), pts.map((p) => (p.z === 4 || p.z === 20 ? 20 : 30)));
  assert.equal(runs.length, 2, `got ${runs.length}`);
  for (const run of runs) assert.ok(run.points.length >= 2);
});

test("a wall is never deeper than it is allowed to be", () => {
  // A riverbed is thirty metres under a bridge deck and a wall down to it is a
  // cliff with a texture. The caller's `feet` is the water's SURFACE where
  // there is water; `maxDrop` is the backstop.
  const pts = line(4);
  const runs = retainingRuns(pts, pts.map(() => 30), pts.map(() => -20), { maxDrop: 12 });
  for (const drop of runs[0].drops) assert.equal(drop, 12);
});

test("every point carries the height it was measured at", () => {
  // The baker draws the face from this, not from a second lookup: two answers
  // to "how high is the kerb here" is a wall that floats.
  const pts = line(4);
  const runs = retainingRuns(pts, [30, 31, 32, 33], pts.map(() => 10));
  assert.deepEqual(runs[0].points.map((p) => p.top), [30, 31, 32, 33]);
});

test("a line with one point has no wall to build", () => {
  assert.deepEqual(retainingRuns([{ x: 0, z: 0 }], [30], [10]), []);
  assert.deepEqual(retainingRuns(undefined, [], []), []);
});

test("a city's walls are found the same way the baker finds them", () => {
  // The city-level answer, which is what a gate counts and what
  // `tools/embankment_shots.mjs` aims at. On flat ground there is nothing to
  // hold up; the hilly fixture is where the walls are, and the saturated city
  // is flat by construction — so this asserts the SHAPE of the answer and the
  // absence, and `walkthrough 128 hilly` asserts the presence.
  const { state } = saturatedCity({ size: 48, buildings: false });
  const model = createModel(state);
  const walls = wallRuns(model, DEFAULTS);
  assert.ok(Array.isArray(walls));
  for (const wall of walls) {
    assert.ok(wall.drop >= DEFAULTS.road.wallMinDrop, `a wall of ${wall.drop} m`);
    assert.ok(Number.isFinite(wall.at.x) && Number.isFinite(wall.at.z));
  }
});

// --- the threshold is a storey, and which storey is data (S18c, A132) --------

test("the threshold is exclusive: MORE than a storey, not a storey", () => {
  // Which side of the rung the boundary falls on, pinned — because the item's
  // words are "more than a storey" and the code is `drop > minDrop`, and a
  // slice that quietly made it `>=` would face a band of shoulders nobody
  // measured. Asked at a threshold of 2 (A132's value) and at 3 (the value
  // before it), so this says something about the rule rather than the setting.
  const pts = line(4);
  for (const minDrop of [2, 3]) {
    const exact = retainingRuns(pts, pts.map(() => 30), pts.map(() => 30 - minDrop), { minDrop });
    assert.deepEqual(exact, [], `a drop of exactly ${minDrop} m was faced`);
    const over = retainingRuns(pts, pts.map(() => 30), pts.map(() => 30 - minDrop - 0.01), { minDrop });
    assert.equal(over.length, 1, `a drop a centimetre over ${minDrop} m was not faced`);
    for (const drop of over[0].drops) assert.ok(Math.abs(drop - (minDrop + 0.01)) < 1e-9, `${drop} m`);
  }
});

test("lowering the threshold by a metre faces the shoulders between them", () => {
  // What A132 actually buys, as a function rather than as a city: the same
  // ground, two thresholds. A test that asserted `wallMinDrop === 2` would
  // protect the number instead of the behaviour — and the number is a picture
  // decision in `data/cityviewer.json`, so it is allowed to move again.
  const pts = line(10);
  const tops = pts.map(() => 30);
  // A hillside stepping down past both thresholds: 1.5 m, 2.4 m and 3.6 m.
  const feet = pts.map((p) => (p.z < 12 ? 28.5 : p.z < 24 ? 27.6 : 26.4));
  const atThree = retainingRuns(pts, tops, feet, { minDrop: 3 });
  const atTwo = retainingRuns(pts, tops, feet, { minDrop: 2 });
  const facedAt = (runs) => runs.flatMap((r) => r.points.map((p, i) => [p.z, r.drops[i]]))
    .filter(([, drop]) => drop > 0).map(([z]) => z);
  assert.ok(facedAt(atTwo).length > facedAt(atThree).length,
    `two metres faced ${facedAt(atTwo).length} points and three faced ${facedAt(atThree).length}`);
  // And the 1.5 m stretch is faced by NEITHER: lowering the rung by a metre is
  // not the same as facing every kerb in the city, which is what the ladder in
  // the item was measured to avoid.
  for (const runs of [atThree, atTwo]) {
    for (const run of runs) {
      for (const point of run.points) assert.ok(point.z >= 12, `a 1.5 m shoulder at z=${point.z} was faced`);
    }
  }
});

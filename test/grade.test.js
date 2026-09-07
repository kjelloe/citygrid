// Streets graded along their length (slice R3; A42, ruling 038).
//
// Until this slice a corridor's height WAS the land's height: `heightAt` inside
// a road returned the terrain at the nearest point on the centre line, so a
// street went wherever the hill went. On the saturated 96×96 the steepest was
// **37.1%** — a road nothing could drive up, and one no test could see, because
// a ribbon drapes obediently onto whatever it is handed and the picture of a
// very steep street is a picture of a very steep street.
//
// Kjell's answer (A42): *"Hills can be taller, but streets to max 15% sounds
// correct."* So the node heights are fixed — a junction is where the land is —
// and each corridor's profile between its two nodes is smoothed to
// `road.maxGrade` with cut and fill.
//
// All of it is arithmetic on a polyline, so all of it is testable here.

import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, setConfig } from "../client/world/config.js";
import { gradeProfile, heightOnProfile } from "../client/world/grade.js";

setConfig(DEFAULTS);
const G = DEFAULTS.road.maxGrade;

/** A straight run of points `step` metres apart, with the given heights. */
function run(heights, step = 20) {
  return heights.map((y, i) => ({ x: i * step, z: 0, y }));
}

function profileOf(points, options = {}) {
  const land = (x) => points[Math.round(x / (points[1].x - points[0].x))]?.y ?? 0;
  return gradeProfile(
    points.map((p) => ({ x: p.x, z: p.z })),
    (x) => land(x),
    { maxGrade: options.maxGrade ?? G, ends: options.ends, flatEnds: options.flatEnds },
  );
}

/** The worst rise over run anywhere on a finished profile. */
function steepest(profile) {
  let worst = 0;
  for (let i = 1; i < profile.ys.length; i += 1) {
    const seg = profile.cum[i] - profile.cum[i - 1];
    if (seg < 1e-9) continue;
    worst = Math.max(worst, Math.abs(profile.ys[i] - profile.ys[i - 1]) / seg);
  }
  return worst;
}

// --- the shape of the answer --------------------------------------------------

test("a profile has one height per point and a cumulative distance", () => {
  const points = run([0, 1, 2, 3, 4]);
  const p = profileOf(points);
  assert.equal(p.ys.length, points.length);
  assert.equal(p.cum.length, points.length);
  assert.equal(p.cum[0], 0);
  assert.ok(Math.abs(p.len - 80) < 1e-9, `${p.len} m over four 20 m spans`);
});

test("flat land stays flat", () => {
  const p = profileOf(run([12, 12, 12, 12]));
  for (const y of p.ys) assert.ok(Math.abs(y - 12) < 1e-6, `${y} on level ground`);
  assert.equal(steepest(p), 0);
});

test("a gentle slope is left alone", () => {
  // 1 m over 20 is 5%, well inside the limit: grading must not flatten a street
  // that was never a problem, or every hill in the city turns into a staircase
  // of level terraces.
  const points = run([0, 1, 2, 3, 4]);
  const p = profileOf(points);
  for (let i = 0; i < points.length; i += 1) {
    assert.ok(Math.abs(p.ys[i] - points[i].y) < 1e-6, `point ${i} moved to ${p.ys[i]}`);
  }
});

// --- the limit ------------------------------------------------------------------

test("a cliff in the middle of a street is cut and filled to the limit", () => {
  // 8 m over 20 is 40%. The ends are pinned, so the only way to obey the limit
  // is to raise the low side and lower the high side — cut and fill.
  const points = run([0, 0, 8, 8, 8]);
  const p = profileOf(points);
  assert.ok(steepest(p) <= G + 1e-6, `still ${(steepest(p) * 100).toFixed(1)}%`);
});

test("the ends are the land, and they do not move", () => {
  // A junction is where the land is (A42): two streets meeting there have to
  // agree, and they can only agree on something neither of them chose.
  const points = run([3, 9, 2, 11, 5]);
  const p = profileOf(points);
  assert.ok(Math.abs(p.ys[0] - 3) < 1e-6, `the head moved to ${p.ys[0]}`);
  assert.ok(Math.abs(p.ys[p.ys.length - 1] - 5) < 1e-6, `the tail moved to ${p.ys[p.ys.length - 1]}`);
});

test("a profile is cut AND filled, not simply flattened", () => {
  // The cheap version is "take the mean", and it is wrong: it lowers every
  // hilltop street to a plateau and the city loses its relief. A graded street
  // still climbs — it just climbs at a rate a lorry can manage.
  // 0, 10%, 10%, 30%, 5% — the ends are 13.75% apart, which is inside the
  // limit, so the middle has somewhere to give.
  const points = run([0, 2, 4, 10, 11]);
  const p = profileOf(points);
  assert.ok(p.ys[p.ys.length - 1] > p.ys[0] + 10, "the street stopped climbing");
  const above = p.ys.some((y, i) => y > points[i].y + 1e-6);
  const below = p.ys.some((y, i) => y < points[i].y - 1e-6);
  assert.ok(above, "nothing was filled");
  assert.ok(below, "nothing was cut");
});

test("ends steeper than the limit give the straightest street possible", () => {
  // Two junctions 20 m apart and 8 m of height between them: no profile with
  // fixed ends can obey 15%, so the answer is the one that is least bad
  // everywhere rather than gentle in the middle and a cliff at one end.
  const points = run([0, 8]);
  const p = profileOf(points);
  assert.ok(Math.abs(steepest(p) - 0.4) < 1e-6, `${(steepest(p) * 100).toFixed(1)}% over a 40% run`);
});

test("a long street with one bump loses the bump and keeps the street", () => {
  const points = run([0, 0, 0, 6, 0, 0, 0]);
  const p = profileOf(points);
  assert.ok(steepest(p) <= G + 1e-6);
  assert.ok(Math.abs(p.ys[0]) < 1e-6 && Math.abs(p.ys[6]) < 1e-6, "the ends moved");
  assert.ok(p.ys[3] < 6, "the bump is still there in full");
  assert.ok(p.ys[3] > 0, "the bump was levelled rather than graded");
});

// --- reading the profile back -----------------------------------------------------

test("a height is read back by distance along, and clamps at both ends", () => {
  const p = profileOf(run([0, 2, 4, 6]));
  assert.ok(Math.abs(heightOnProfile(p, 0) - p.ys[0]) < 1e-9);
  assert.ok(Math.abs(heightOnProfile(p, p.len) - p.ys[3]) < 1e-9);
  assert.ok(Math.abs(heightOnProfile(p, -50) - p.ys[0]) < 1e-9);
  assert.ok(Math.abs(heightOnProfile(p, p.len + 50) - p.ys[3]) < 1e-9);
  // And halfway along a span is halfway up it.
  assert.ok(Math.abs(heightOnProfile(p, 10) - (p.ys[0] + p.ys[1]) / 2) < 1e-9);
});

test("reading a profile back never exceeds the limit either", () => {
  // The profile obeying the limit at its own points says nothing about what a
  // caller sampling every two metres sees — unless the interpolation is linear,
  // which is the reason it is.
  const p = profileOf(run([0, 0, 8, 8, 8]));
  let worst = 0;
  for (let d = 0; d + 2 <= p.len; d += 2) {
    worst = Math.max(worst, Math.abs(heightOnProfile(p, d + 2) - heightOnProfile(p, d)) / 2);
  }
  assert.ok(worst <= G + 1e-6, `${(worst * 100).toFixed(1)}% between samples`);
});

// --- the edges nobody thinks about ---------------------------------------------------

test("a corridor of one point, or of none, does not throw", () => {
  assert.equal(gradeProfile([], () => 0, { maxGrade: G }).ys.length, 0);
  assert.equal(gradeProfile([{ x: 0, z: 0 }], () => 5, { maxGrade: G }).ys.length, 1);
});

test("two points in the same place do not divide by zero", () => {
  const p = gradeProfile([{ x: 0, z: 0 }, { x: 0, z: 0 }], () => 7, { maxGrade: G });
  for (const y of p.ys) assert.ok(Number.isFinite(y), `${y}`);
});

test("explicit end heights win over the land", () => {
  // A node's height is shared by every corridor that meets there, so the caller
  // hands it in rather than each corridor deciding for itself — two streets
  // that disagree about the height of the junction between them is a step in
  // the road that nothing can drive over.
  const p = profileOf(run([0, 1, 2, 3]), { ends: [10, 13] });
  assert.ok(Math.abs(p.ys[0] - 10) < 1e-6, `${p.ys[0]}`);
  assert.ok(Math.abs(p.ys[3] - 13) < 1e-6, `${p.ys[3]}`);
});

test("the steepest grade is reported, so a gate does not have to re-derive it", () => {
  const gentle = profileOf(run([0, 1, 2, 3]));
  assert.ok(Math.abs(gentle.steepest - 0.05) < 1e-6, `${gentle.steepest}`);
  const cliff = profileOf(run([0, 8]));
  assert.ok(Math.abs(cliff.steepest - 0.4) < 1e-6, `${cliff.steepest}`);
});

test("grading is a function of its inputs and nothing else", () => {
  const a = profileOf(run([0, 5, 1, 9, 2]));
  const b = profileOf(run([0, 5, 1, 9, 2]));
  assert.deepEqual([...a.ys], [...b.ys]);
});

// --- the junction is level (slice R3) -------------------------------------------

test("a profile is flat across the junction box at each end", () => {
  // Node heights being fixed is only half of "a junction is where the land is".
  // The other half is that the box ITSELF is level: two streets crossing there
  // are the same piece of tarmac, and a street still climbing as it enters one
  // is a street the blend then has to drag up to meet the other — which is
  // where the field's worst grade came from, not from the streets at all.
  const p = profileOf(run([0, 2, 4, 6, 8]), { flatEnds: 6.5 });
  assert.ok(Math.abs(heightOnProfile(p, 0) - heightOnProfile(p, 6.5)) < 1e-6,
    "the street is still climbing where the junction begins");
  assert.ok(Math.abs(heightOnProfile(p, p.len) - heightOnProfile(p, p.len - 6.5)) < 1e-6,
    "and at the other end");
});

test("a level junction does not flatten the street between them", () => {
  const p = profileOf(run([0, 2, 4, 6, 8]), { flatEnds: 6.5 });
  assert.ok(p.ys[p.ys.length - 1] - p.ys[0] > 7.9, "the street stopped climbing");
});

test("flat ends shorten the run the grade has to fit into, and say so", () => {
  // 80 m of street with 6.5 m of level junction at each end is 67 m to climb
  // in. A profile that ignored that would obey the limit on paper and break it
  // where the two meet.
  const p = profileOf(run([0, 3, 6, 9, 12]), { flatEnds: 6.5 });
  let worst = 0;
  for (let d = 0; d + 1 <= p.len; d += 1) {
    worst = Math.max(worst, Math.abs(heightOnProfile(p, d + 1) - heightOnProfile(p, d)));
  }
  assert.ok(Math.abs(worst - 12 / (80 - 13)) < 1e-3,
    `${(worst * 100).toFixed(1)}% against ${((12 / 67) * 100).toFixed(1)}% over the graded run`);
});

test("a corridor shorter than its two junction boxes is not turned inside out", () => {
  const p = profileOf(run([0, 4], 10), { flatEnds: 6.5 });
  for (const y of p.ys) assert.ok(Number.isFinite(y), `${y}`);
  assert.ok(Math.abs(p.ys[0]) < 1e-6);
  assert.ok(Math.abs(p.ys[p.ys.length - 1] - 4) < 1e-6);
});

// The performance sweep, as data (slice D1).
//
// Every performance number cityviewer has produced came from SwiftShader in
// headless Chromium: right about triangles and draw calls, meaningless about
// frame time. The governor, the tiers and the 320k/140k/40k budgets were
// designed for a phone and an RTX 4090, and neither has drawn a frame.
//
// The sweep is the shape of that measurement, and it is a list of plain objects
// so the shape can be argued about here rather than in a browser. What matters
// is coverage: a sweep that misses a mode measures a game nobody plays, and one
// that misses the painted style measures the one nobody was going to ship.

import test from "node:test";
import assert from "node:assert/strict";
import { SWEEP, MAPS, sweepSeconds, stepLabel } from "../client/debug/perf-sweep.js";

const modes = () => new Set(SWEEP.map((s) => s.mode));
const styles = () => new Set(SWEEP.map((s) => s.style ?? "plain"));

test("every camera mode is measured", () => {
  // Two projections and the street camera behave differently enough that three
  // renderer bugs in the V lane were invisible to a single-configuration gate
  // (CLAUDE.md, measurement discipline).
  assert.deepEqual([...modes()].sort(), ["city", "ortho", "street"]);
});

test("every style is measured, including the one that is the target", () => {
  // Ruling 033 names `painted` as the target and it is the High default since
  // R2. A sweep that only measures `plain` measures the fallback.
  assert.ok(styles().has("plain"));
  assert.ok(styles().has("painted"));
});

test("the city camera is measured at more than one zoom", () => {
  // The budget is spent per frame and the frame is a function of the span: one
  // zoom is one number about one view.
  const spans = SWEEP.filter((s) => s.mode === "city").map((s) => s.span);
  assert.ok(new Set(spans).size >= 4, `city spans: ${[...new Set(spans)].join(", ")}`);
});

test("a low pitch is measured, because that is where the frustum is worst", () => {
  // Under perspective at a low pitch the visible footprint stretches to the
  // horizon — it is the case every LOD defect in this project has come from.
  assert.ok(SWEEP.some((s) => s.mode === "city" && s.pitch !== undefined && s.pitch <= 20),
    "no low-pitch step");
});

test("night is measured, because it is the tightest frame there is", () => {
  // 289,446 triangles of 320,000 at High with eight baked chunks: the night
  // frame is where the ladder runs out first.
  assert.ok(SWEEP.some((s) => s.time === "night"), "no night step");
});

test("the street step walks, so the bake path is exercised", () => {
  // A street shot standing still measures a cache that is already warm. The
  // walker covers a fixed leg so chunks are baked during the sample.
  const street = SWEEP.filter((s) => s.mode === "street");
  assert.ok(street.length > 0, "no street step");
  assert.ok(street.some((s) => s.walkM > 0), "nobody walks in the street step");
});

test("every step holds long enough for a p95 to mean something", () => {
  // The governor's window is 60 frames. A step shorter than that reports a
  // percentile over a handful of samples, which is a number with no error bar
  // and every appearance of one.
  for (const step of SWEEP) {
    assert.ok(step.seconds >= 3, `${stepLabel(step)} holds for ${step.seconds}s`);
  }
});

test("the whole sweep is short enough that somebody will actually run it", () => {
  // It is meant to be run by Kjell on a phone, once per device. Ten minutes of
  // holding still is a measurement that never gets taken.
  assert.ok(sweepSeconds() <= 120, `${sweepSeconds()}s of sweep`);
  assert.ok(sweepSeconds() >= 20, `${sweepSeconds()}s is too short to mean anything`);
});

test("every step is named, and no two names collide", () => {
  // The card is pasted into a message and read by a person; two rows called the
  // same thing is a table nobody can use.
  const labels = SWEEP.map(stepLabel);
  assert.equal(new Set(labels).size, labels.length, `duplicate labels: ${labels.join(", ")}`);
  for (const label of labels) assert.ok(label.length > 3 && label.length < 40, label);
});

test("the sweep is data — no functions, no state, nothing to remember", () => {
  for (const step of SWEEP) {
    for (const [key, value] of Object.entries(step)) {
      assert.ok(["string", "number", "boolean"].includes(typeof value),
        `${stepLabel(step)}.${key} is a ${typeof value}`);
    }
  }
});

// --- the maps the sweep can be run on (slice D6) ----------------------------
//
// Every cityviewer number was taken on a 96-tile `rolling` city, and three open
// questions say "measure it on a bigger or steeper map first". The map is a
// property of the RUN, not of a step — nine views of one city — so it is a
// separate list, and the card records which one it was on.

test("the maps cover more than one size and more than one terrain", () => {
  assert.ok(new Set(MAPS.map((m) => m.size)).size >= 3, "one size is one map");
  assert.ok(new Set(MAPS.map((m) => m.terrain)).size >= 2, "one terrain is one map");
});

test("a map bigger than the one the questions were asked on", () => {
  // Q66 (one unculled water mesh) and Q68 (a night frame at High) were both
  // asked on 96 and both say "ask again on something larger".
  assert.ok(MAPS.some((m) => m.size >= 256), `largest is ${Math.max(...MAPS.map((m) => m.size))}`);
});

test("a steep map, because Q64 is a question about one", () => {
  assert.ok(MAPS.some((m) => m.terrain === "hilly"), "no hilly map");
});

test("every map is one the engine will actually generate", () => {
  for (const map of MAPS) {
    assert.ok(["flat", "rolling", "hilly"].includes(map.terrain), `${map.id}: ${map.terrain}`);
    assert.ok(map.size >= 48 && map.size <= 256 && map.size % 16 === 0,
      `${map.id}: ${map.size} tiles`);
  }
});

test("the maps are named, distinctly, and are data", () => {
  const ids = MAPS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, ids.join(", "));
  for (const map of MAPS) {
    for (const [key, value] of Object.entries(map)) {
      assert.ok(["string", "number", "boolean"].includes(typeof value),
        `${map.id}.${key} is a ${typeof value}`);
    }
  }
});

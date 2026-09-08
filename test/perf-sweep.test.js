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
import { SWEEP, sweepSeconds, stepLabel } from "../client/debug/perf-sweep.js";

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

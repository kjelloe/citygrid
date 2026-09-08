// The performance sweep, as data (slice D1).
//
// Every performance number this project has produced came from SwiftShader in
// headless Chromium. Triangles and draw calls are counted by the renderer and
// are true anywhere; frame time on a software rasteriser is a number about the
// machine that ran it. The governor, the three tiers and the 40k/140k/320k
// budgets were designed for a phone and an RTX 4090, and neither has drawn a
// frame (`workitems-measurement.md`, and the largest gap RELEASE.md admits to).
//
// This file is the sweep, and it is deliberately nothing but a list. It has no
// three, no DOM and no clock, so `test/perf-sweep.test.js` can argue about the
// *shape* of the measurement — every mode, both styles, four zooms, a low
// pitch, a night frame, and somebody walking — in node, where an argument is
// cheap. `client/debug/perf-card.js` is what drives it; `tools/perf_card.mjs`
// drives the same list under Playwright so a SwiftShader run and a phone run
// come back in the same shape and can be put in one table.
//
// Kept short on purpose (45 s). It is meant to be run by a person holding a
// phone, and a sweep nobody finishes measures nothing.

/** Radians, the default city pitch — `PITCH` in `client/world/orbit.js`. Named
 * here rather than imported because `client/world/` is the pure model layer and
 * this is a debug script; the test that matters compares degrees. */
const DEFAULT_PITCH = 35;

/**
 * One step: hold this view for `seconds`, then write down what the frame cost.
 *
 * `span` is tiles across the shorter screen axis — the only zoom control there
 * is, in both projections. `pitch` is degrees. `walkM` is how far the walker
 * covers during the step, which is how the street step exercises the bake path
 * rather than a cache that is already warm.
 */
export const SWEEP = [
  { id: "city-close", mode: "city", span: 20, pitch: DEFAULT_PITCH, time: "day", style: "plain", walkM: 0, seconds: 5 },
  { id: "city-near", mode: "city", span: 40, pitch: DEFAULT_PITCH, time: "day", style: "plain", walkM: 0, seconds: 5 },
  { id: "city-mid", mode: "city", span: 80, pitch: DEFAULT_PITCH, time: "day", style: "plain", walkM: 0, seconds: 5 },
  // The whole map. Not 240: on a 96-tile fixture everything is already in the
  // frustum at 120, and the first run's 120 and 240 rows were the same 49,400
  // triangles and the same 83.3 ms — one measurement printed twice.
  { id: "city-whole", mode: "city", span: 120, pitch: DEFAULT_PITCH, time: "day", style: "plain", walkM: 0, seconds: 5 },
  // Low pitch: under perspective the visible footprint stretches to the
  // horizon, and every LOD defect in the V lane came from this view.
  { id: "city-flat", mode: "city", span: 40, pitch: 14, time: "day", style: "plain", walkM: 0, seconds: 5 },
  { id: "ortho-mid", mode: "ortho", span: 96, pitch: DEFAULT_PITCH, time: "day", style: "plain", walkM: 0, seconds: 5 },
  // The tightest frame there is: 289,446 triangles of 320,000 at High with
  // eight baked chunks, 93% of it in the chunks (Q68).
  { id: "city-night", mode: "city", span: 40, pitch: DEFAULT_PITCH, time: "night", style: "plain", walkM: 0, seconds: 5 },
  // `painted` is the High default and ruling 033's target. A sweep that only
  // measures `plain` measures the fallback.
  { id: "city-painted", mode: "city", span: 40, pitch: DEFAULT_PITCH, time: "day", style: "painted", walkM: 0, seconds: 5 },
  // Fifteen seconds, not five: the walker runs at 4 m/s and a 60 m leg takes
  // fifteen. The first run asked for 60 m in a five-second hold and got 20.
  { id: "street-walk", mode: "street", span: 30, pitch: DEFAULT_PITCH, time: "day", style: "plain", walkM: 60, seconds: 15 },
];

/**
 * The cities the sweep can be run on (D6).
 *
 * A map is a property of the RUN, not of a step: nine views of one city. Every
 * cityviewer number was taken on `base`, and three open questions say "ask again
 * on something bigger or steeper" — Q66 (the water surface is one unculled mesh
 * for the whole map), Q68 (a night frame at High is 93% baked chunks) and Q64
 * (934 of 2,161 corridors on a `hilly` map cannot make a 15% grade).
 *
 * 256 is the largest the lobby offers; `hilly` at 128 is the steepest map a
 * player can start.
 */
export const MAPS = [
  { id: "base", size: 96, terrain: "rolling", note: "what every cityviewer number was measured on" },
  { id: "big", size: 256, terrain: "rolling", note: "Q66 and Q68, on the largest map the lobby offers" },
  { id: "steep", size: 128, terrain: "hilly", note: "Q64, on the steepest map a player can start" },
];

/** What the card calls the row, and what a person reads in a pasted table. */
export function stepLabel(step) {
  const parts = [step.mode];
  if (step.mode !== "street") parts.push(`${step.span}t`);
  if (step.pitch !== DEFAULT_PITCH) parts.push(`${step.pitch}°`);
  if (step.time !== "day") parts.push(step.time);
  if (step.style !== "plain") parts.push(step.style);
  if (step.walkM > 0) parts.push(`walk ${step.walkM}m`);
  return parts.join(" ");
}

export function sweepSeconds(sweep = SWEEP) {
  return sweep.reduce((total, step) => total + step.seconds, 0);
}

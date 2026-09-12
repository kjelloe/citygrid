// The hour on the road (slice B4).
//
// A city whose traffic is the same at three in the morning as at half past five
// is a city with no day in it. The curve is pure, so what it promises — a rush
// that arrives rather than pops, a night that is quiet, a shape that never
// leaves its bounds — is checked here rather than counted in a screenshot.

import test from "node:test";
import assert from "node:assert/strict";
import { rushScale, tideAt, RUSH_MIN, RUSH_MAX } from "../client/world/rush.js";

test("the night is quiet and the rushes are busy", () => {
  const night = rushScale(0.8);
  const day = rushScale(0.25);
  const morning = rushScale(0.08);
  const evening = rushScale(0.44);
  assert.ok(night < day, `night ${night} is not quieter than the day ${day}`);
  assert.ok(morning > day && evening > day, "a rush is no busier than the working day");
  assert.ok(Math.abs(night - RUSH_MIN) < 1e-9, `night is ${night}, not the floor`);
  assert.ok(Math.abs(morning - RUSH_MAX) < 1e-9, `the morning peak is ${morning}`);
});

test("the curve never leaves its bounds, at any hour", () => {
  // Including the wrap: a curve that overshoots at midnight empties or floods a
  // city once a day, which is the kind of thing nobody sees until they leave
  // the game running.
  for (let p = -2; p <= 3; p += 0.005) {
    const v = rushScale(p);
    assert.ok(v >= RUSH_MIN - 1e-9 && v <= RUSH_MAX + 1e-9, `phase ${p.toFixed(3)} gives ${v}`);
  }
});

test("a rush arrives rather than popping", () => {
  // Interpolated, not stepped. A road that quadrupled its cars the instant the
  // clock crossed a boundary would be a visible pop — and the whole point of a
  // rush hour is that you can see it coming.
  let worst = 0;
  let previous = rushScale(0);
  for (let p = 0; p <= 1; p += 0.002) {
    const now = rushScale(p);
    worst = Math.max(worst, Math.abs(now - previous));
    previous = now;
  }
  assert.ok(worst < 0.05, `the curve jumps by ${worst.toFixed(3)} in a 0.2% step`);
});

test("the day wraps without a seam", () => {
  assert.ok(Math.abs(rushScale(0.999) - rushScale(0)) < 0.02, "midnight is a cliff");
  assert.equal(rushScale(1.25), rushScale(0.25));
  assert.equal(rushScale(-0.75), rushScale(0.25));
});

test("a phase that is not a number does not empty the roads", () => {
  // The renderer hands this its clock; a caller that has not started one yet
  // must get an ordinary city, not a dead one.
  assert.equal(rushScale(undefined), 1);
  assert.equal(rushScale(NaN), 1);
});

test("the tide turns twice a day and is still between", () => {
  assert.equal(tideAt(0.08), "out", "nobody leaves home in the morning");
  assert.equal(tideAt(0.44), "in", "nobody comes home in the evening");
  assert.equal(tideAt(0.28), "none");
  assert.equal(tideAt(0.8), "none");
  // And it wraps like the curve does.
  assert.equal(tideAt(1.08), "out");
  assert.equal(tideAt(-0.92), "out");
});

test("the tides sit inside the rushes", () => {
  // The two have to agree: a tide that ran while the road was at its quietest
  // would be a direction with no traffic in it.
  for (const p of [0.05, 0.1, 0.15]) assert.ok(rushScale(p) > 1, `morning ${p} is not busy`);
  for (const p of [0.42, 0.46, 0.5]) assert.ok(rushScale(p) > 1, `evening ${p} is not busy`);
});

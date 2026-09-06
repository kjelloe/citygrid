// Time of day (slice E6; spec §7.3).
//
// Presets, not a slider: each one is a composition, and the thing that has to
// be right is the arithmetic between them. A rig that jumps is a cut; a rig
// that never arrives is a night that is always slightly day; and a `night`
// factor that is not exactly 0 by day means every lit window in the city is
// faintly on at noon, which is the kind of thing nobody sees until they look at
// a screenshot at the wrong hour.

import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS } from "../client/world/config.js";
import {
  PRESET_NAMES, presetFor, blendPresets, createTimeOfDay, phaseOf,
} from "../client/render/time-of-day.js";

const RIG = { key: 1.15, keyColour: 0xfffaf0, hemi: 1.25, hemiSky: 0xdcecff, hemiGround: 0x93aa78, sunHeight: 150 };

test("the three presets are the three the spec names, and they are data", () => {
  assert.deepEqual([...PRESET_NAMES], ["day", "sunset", "night"]);
  for (const name of PRESET_NAMES) {
    assert.deepEqual(presetFor(name), DEFAULTS.presets[name], `${name} has drifted from the data`);
  }
});

test("an unknown preset falls back to day rather than throwing", () => {
  // What comes out of localStorage was written by an older build.
  assert.deepEqual(presetFor("teatime"), DEFAULTS.presets.day);
  assert.deepEqual(presetFor(undefined), DEFAULTS.presets.day);
});

test("night is fully night and day is exactly zero of it", () => {
  assert.equal(presetFor("day").night, 0);
  assert.equal(presetFor("night").night, 1);
  assert.ok(presetFor("sunset").night > 0 && presetFor("sunset").night < 1);
});

test("blending reaches each end exactly", () => {
  const a = presetFor("day");
  const b = presetFor("night");
  assert.deepEqual(blendPresets(a, b, 0), a);
  assert.deepEqual(blendPresets(a, b, 1), b);
});

test("a blend is between its ends, in numbers and in colours", () => {
  const a = presetFor("day");
  const b = presetFor("night");
  const mid = blendPresets(a, b, 0.5);
  assert.ok(mid.night > a.night && mid.night < b.night);
  assert.ok(mid.key < a.key && mid.key > b.key);
  // A colour is blended per channel, not as an integer — halfway between
  // 0x0000ff and 0xff0000 as a number is 0x7f8080, which is grey, and as a
  // colour is 0x7f007f, which is purple.
  const channel = (hex, shift) => (hex >> shift) & 255;
  for (const shift of [16, 8, 0]) {
    const lo = Math.min(channel(a.sky, shift), channel(b.sky, shift));
    const hi = Math.max(channel(a.sky, shift), channel(b.sky, shift));
    assert.ok(channel(mid.sky, shift) >= lo && channel(mid.sky, shift) <= hi,
      `channel ${shift} of ${mid.sky.toString(16)} is outside ${lo}..${hi}`);
  }
});

// --- the interpolator, which is the part that runs every frame ---------------

test("setting a preset arrives at it, over about a second", () => {
  const clock = createTimeOfDay("day");
  clock.set("night");
  assert.notDeepEqual(clock.current, presetFor("night"), "a change must not be a cut");
  clock.update(0.4);
  const halfway = clock.current;
  assert.ok(halfway.night > 0 && halfway.night < 1, `night is ${halfway.night} after 0.4 s`);
  clock.update(1.2);
  assert.deepEqual(clock.current, presetFor("night"), "and it has to actually arrive");
});

test("a second `set` to the same preset does not restart the fade", () => {
  const clock = createTimeOfDay("day");
  clock.set("night");
  clock.update(0.5);
  const was = clock.current.night;
  clock.set("night");
  clock.update(0);
  assert.equal(clock.current.night, was);
});

test("no time passing means nothing moves, so `life=0` freezes the hour too", () => {
  const clock = createTimeOfDay("day");
  clock.set("night");
  const before = { ...clock.current };
  clock.update(0);
  assert.deepEqual({ ...clock.current }, before);
});

test("the first preset is arrived at immediately, not faded in from nowhere", () => {
  assert.deepEqual(createTimeOfDay("night").current, presetFor("night"));
  assert.deepEqual(createTimeOfDay().current, presetFor("day"));
});

test("changing the target mid-fade continues from where it is", () => {
  const clock = createTimeOfDay("day");
  clock.set("night");
  clock.update(0.5);
  const midway = clock.current.night;
  clock.set("day");
  clock.update(0.1);
  assert.ok(clock.current.night < midway, "turning back must go back");
  assert.ok(clock.current.night > 0, "and not snap");
});

// --- the schedule ------------------------------------------------------------

test("the clock walks day, sunset, night and back", () => {
  const seen = [];
  for (let tick = 0; tick < 96; tick += 1) {
    const name = phaseOf(tick, 24);
    if (seen[seen.length - 1] !== name) seen.push(name);
  }
  assert.ok(seen.length >= 4, `the day only had ${seen.length} phases: ${seen}`);
  assert.equal(seen[0], "day");
  assert.ok(seen.includes("sunset"));
  assert.ok(seen.includes("night"));
  // And it comes back round.
  assert.equal(phaseOf(0, 24), phaseOf(24, 24));
});

test("the schedule spends most of the day in daylight", () => {
  let day = 0;
  for (let tick = 0; tick < 240; tick += 1) if (phaseOf(tick, 24) === "day") day += 1;
  assert.ok(day / 240 > 0.4 && day / 240 < 0.75, `${(day / 240 * 100).toFixed(0)}% daylight`);
});

// --- what the rig is handed --------------------------------------------------

test("a preset scales the rig rather than replacing it", () => {
  const clock = createTimeOfDay("night");
  const lit = clock.applyTo(RIG);
  assert.ok(Math.abs(lit.key - RIG.key * presetFor("night").key) < 1e-9);
  assert.ok(Math.abs(lit.hemi - RIG.hemi * presetFor("night").hemi) < 1e-9);
  assert.equal(lit.keyColour, presetFor("night").keyColour, "the colour is the preset's, absolute");
  // The sun drops without the rig's own character being lost: plain stands the
  // sun high and painted stands it low, and both get lower at dusk.
  const low = { ...RIG, sunHeight: 60 };
  assert.ok(createTimeOfDay("sunset").applyTo(low).sunHeight < createTimeOfDay("sunset").applyTo(RIG).sunHeight);
  assert.ok(createTimeOfDay("sunset").applyTo(RIG).sunHeight < createTimeOfDay("day").applyTo(RIG).sunHeight);
});

test("a rig with no key is left with no key", () => {
  // `pixel` is unlit (spec §7.1) and a time of day must not switch a sun on.
  const flat = { key: 0, keyColour: 0xffffff, hemi: 1, hemiSky: 0xffffff, hemiGround: 0xffffff };
  assert.equal(createTimeOfDay("night").applyTo(flat).key, 0);
});

// Time of day (slice E6; spec §7.3).
//
// Presets, not a slider. Both reference worlds ship a list and say why: each
// preset is a composition — a sun angle, a set of colours and a fog together —
// and a slider through them passes through hours nobody composed.
//
// A preset SCALES the rig rather than replacing it. `key`, `hemi` and
// `sunHeight` are factors on whatever `lightingFor(style)` already said, so
// dusk is dusk in all three styles and none of them stops being itself
// (ruling 017: a style is geometry, shading and palette). The colours are
// absolute, because "the same blue, dimmer" is not what dusk looks like.
//
// Pure: no three, no DOM, no clock of its own. `update(dt)` takes its time from
// the caller, which is what makes `?life=0` freeze the hour along with the
// traffic and the walker.

import { getConfig } from "../world/config.js";

export const PRESET_NAMES = Object.freeze(["day", "sunset", "night"]);

/** How long a change takes. A second: long enough not to be a cut, short
 * enough that a player who picked "night" from the settings believes it. */
const FADE = 1;

export function presetFor(name) {
  const presets = getConfig().presets;
  return presets[name] ?? presets.day;
}

/** Per-channel, because a colour is three numbers wearing one. Halfway between
 * 0x0000ff and 0xff0000 as an integer is grey; as a colour it is purple. */
function blendColour(a, b, t) {
  const mix = (shift) => {
    const lo = (a >> shift) & 255;
    const hi = (b >> shift) & 255;
    return Math.round(lo + (hi - lo) * t) << shift;
  };
  return mix(16) | mix(8) | mix(0);
}

/** Which fields of a preset are colours. Named, not sniffed: guessing from the
 * key ("does it end in Colour, or is it big enough to be a hex?") is how a
 * light intensity of 5000 would one day be blended as a colour. */
const COLOURS = new Set(["keyColour", "hemiSky", "hemiGround", "sky"]);

export function blendPresets(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out = {};
  for (const key of Object.keys(a)) {
    out[key] = COLOURS.has(key) ? blendColour(a[key], b[key], t) : a[key] + (b[key] - a[key]) * t;
  }
  return out;
}

/**
 * Which preset the clock is in.
 *
 * `period` is how long a whole day is, in whatever unit `at` is measured in.
 * It was game TICKS and is now wall-clock SECONDS (R2, A41): at the play speed
 * a tick is 400 ms, so 48 ticks was a nineteen-second day — and six seconds at
 * fast speed, because the game's clock speeds up and the sun is scenery. The
 * shape is deliberate: over half is daylight, dusk is short, and night is long
 * enough to be worth having built (spec §7.3 — night is what pays for L3).
 */
export function phaseOf(at, period) {
  const phase = ((at % period) + period) % period / period;
  if (phase < 0.5) return "day";
  if (phase < 0.62) return "sunset";
  if (phase < 0.9) return "night";
  return "sunset";
}

/**
 * The rig's own values with the hour applied.
 *
 * A rig with no key keeps no key: `pixel` is unlit (spec §7.1) and a time of
 * day must not switch a sun on in a style that has never had one.
 */
function applyTo(preset, rig) {
  return {
    ...rig,
    key: rig.key * preset.key,
    keyColour: preset.keyColour,
    hemi: rig.hemi * preset.hemi,
    hemiSky: preset.hemiSky,
    hemiGround: preset.hemiGround,
    sunHeight: (rig.sunHeight ?? 120) * preset.sunHeight,
    night: preset.night,
    sky: preset.sky,
    fogNear: preset.fogNear,
    fogFar: preset.fogFar,
  };
}

/**
 * The interpolator the frame loop drives.
 *
 * `set` names a target and `update(dt)` walks towards it; the FIRST preset is
 * arrived at immediately, because a game that fades in from an unspecified
 * light on its first frame is a game that flickers on load.
 */
export function createTimeOfDay(name = "day") {
  let from = presetFor(name);
  let target = name;
  let current = from;
  let t = 1;

  return {
    get current() { return current; },
    get target() { return target; },
    get night() { return current.night; },

    set(next) {
      if (next === target) return;
      from = current;
      target = PRESET_NAMES.includes(next) ? next : "day";
      t = 0;
    },

    update(dt) {
      if (t >= 1 || !(dt > 0)) return current;
      t = Math.min(1, t + dt / FADE);
      current = blendPresets(from, presetFor(target), t);
      return current;
    },

    applyTo(rig) { return applyTo(current, rig); },
  };
}

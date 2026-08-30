// The statistics screen, as data (slice 4.6).
//
// `plan-v1.md`'s gate: "Every statistic has an explanation string; history
// buffers are bounded and hashed." The buffers are `engine/history.js`; the
// explanations are here.
//
// §30 makes the explanation an **accessibility** feature as much as a usability
// one: "Statistics are always accompanied by a plain-language interpretation."
// So every series carries a sentence saying what the number is and which
// direction is good, and the reading below turns the last twelve months into
// words. A graph nobody can read is a decoration; a graph with a sentence under
// it is a statistic.

import { HISTORY_FIELDS } from "../../engine/constants.js";
import { changeOver } from "../../engine/history.js";

/** How to read a series. `good` says which direction is an improvement, which
 * is the whole difference between "crime is up 40%" being news and being a
 * disaster — and it is why the trend arrow cannot be shared with the treasury's. */
export const SERIES = [
  { field: "population", labelKey: "stat.population", aboutKey: "stat.population.about", good: "up" },
  { field: "jobs", labelKey: "stat.jobs", aboutKey: "stat.jobs.about", good: "up" },
  { field: "treasury", labelKey: "stat.treasury", aboutKey: "stat.treasury.about", good: "up", money: true },
  { field: "landValue", labelKey: "stat.landValue", aboutKey: "stat.landValue.about", good: "up" },
  { field: "pollution", labelKey: "stat.pollution", aboutKey: "stat.pollution.about", good: "down" },
  { field: "crime", labelKey: "stat.crime", aboutKey: "stat.crime.about", good: "down" },
  { field: "congested", labelKey: "stat.congested", aboutKey: "stat.congested.about", good: "down" },
  { field: "demandR", labelKey: "stat.demandR", aboutKey: "stat.demandR.about", good: "flat" },
  { field: "demandC", labelKey: "stat.demandC", aboutKey: "stat.demandC.about", good: "flat" },
  { field: "demandI", labelKey: "stat.demandI", aboutKey: "stat.demandI.about", good: "flat" },
];

/** A year of months. Every reading is "over the last year", because a month is
 * noise and the player has no way to act on it. */
export const WINDOW = 12;

/** How much a change has to be before it is worth a word. Below this the
 * reading is "steady" — a city that wobbles 2% is not doing anything, and
 * saying so every month trains the player to ignore the screen. */
const NOISE = 5;

/** The plain-language reading of one series.
 *
 * `verdictKey` is the sentence; `direction` is for the arrow; `sign` says
 * whether the change is good, bad or neither, which is NOT the same as whether
 * it went up. */
export function reading(samples, series) {
  if (samples.length < 2) {
    return { change: 0, direction: 0, sign: "none", verdictKey: "stat.verdict.tooSoon" };
  }
  const change = changeOver(samples, series.field, WINDOW);
  const direction = change > 0 ? 1 : change < 0 ? -1 : 0;
  const magnitude = change < 0 ? -change : change;

  if (magnitude < NOISE) {
    return { change, direction: 0, sign: "none", verdictKey: "stat.verdict.steady" };
  }
  // A series with no good direction — the demand bars — reports movement
  // without calling it good or bad, because neither is.
  if (series.good === "flat") {
    return {
      change,
      direction,
      sign: "none",
      verdictKey: direction > 0 ? "stat.verdict.rising" : "stat.verdict.falling",
    };
  }
  const improving = (series.good === "up") === (direction > 0);
  return {
    change,
    direction,
    sign: improving ? "good" : "bad",
    verdictKey: improving ? "stat.verdict.better" : "stat.verdict.worse",
  };
}

export function latest(samples, field) {
  if (samples.length === 0) return 0;
  return samples[samples.length - 1][field];
}

/**
 * The polyline for a sparkline, in a `width` × `height` box.
 *
 * Scaled to the series' own range, not to a fixed one: a treasury of two
 * million and a crime average of 40 are the same shape of question ("which way
 * is it going"), and a shared scale would flatten one of them to a line.
 * A flat series draws down the middle rather than dividing by zero.
 */
export function points(samples, field, width, height) {
  if (samples.length === 0) return [];
  const values = samples.map((s) => s[field]);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((value, index) => ({
    x: Math.round(index * step * 100) / 100,
    y: span === 0
      ? Math.round(height / 2)
      : Math.round((height - ((value - low) * height) / span) * 100) / 100,
  }));
}

/** Everything the panel needs, for every series. */
export function statistics(state) {
  const samples = state.history?.samples ?? [];
  return SERIES.map((series) => ({
    ...series,
    value: latest(samples, series.field),
    reading: reading(samples, series),
    samples: samples.length,
  }));
}

/** Guards against a series naming a field the engine does not sample. */
export function unknownFields() {
  return SERIES.filter((s) => !HISTORY_FIELDS.includes(s.field)).map((s) => s.field);
}

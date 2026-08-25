// World generation: terrain, then districts, then the fairness gate, with
// re-rolls until the region is one people can fairly play on.
//
// A seed that fails the gate is not shipped. Re-rolling derives a new seed
// deterministically from the old one, so "seed 12" always means the same
// finished region even when the first two attempts were rejected.

import { mix32 } from "../shared/prng.js";
import { createState } from "./state.js";
import { generateTerrain, surveyTerrain } from "./terrain.js";
import { assignDistricts } from "./districts.js";
import { describeRegion, regionNameKey } from "./region-name.js";
import { MODE_DISTRICTS } from "./constants.js";

export var MAX_ATTEMPTS = 12;

/** Districts mode needs one district per seat; every other mode still gets a
 * partition, because the same data drives neutral-land rules, the minimap and
 * the "whose land is this" question. */
function districtCount(options) {
  if (options.mode === MODE_DISTRICTS) return options.seats;
  return Math.min(options.seats, 8);
}

export function generateWorld(options) {
  var attempt = 0;
  var seed = options.seed >>> 0;
  var lastVerdict = { ok: false, reason: "not attempted", spread: 0, stats: [] };

  while (attempt < MAX_ATTEMPTS) {
    var attemptOptions = {};
    for (var key in options) {
      if (Object.hasOwn(options, key)) attemptOptions[key] = options[key];
    }
    attemptOptions.seed = seed;

    var state = createState(attemptOptions);
    generateTerrain(state);

    var survey = surveyTerrain(state);
    // A region with nowhere to build, or with no water at all when the style
    // promised some, is degenerate before fairness even matters.
    // A fifth of the region buildable is the floor. Below that there is
    // nowhere to put a city regardless of how fairly it is divided.
    if (survey.buildable * 5 < survey.total) {
      lastVerdict = { ok: false, reason: "too little buildable land", spread: 0, stats: [] };
      seed = mix32(seed);
      attempt += 1;
      continue;
    }

    var verdict = assignDistricts(state, districtCount(attemptOptions), false);
    if (verdict.ok) {
      return {
        ok: true,
        state: state,
        attempts: attempt + 1,
        seed: seed,
        survey: survey,
        districts: verdict,
        description: describeRegion(state),
        nameKey: regionNameKey(describeRegion(state)),
      };
    }
    lastVerdict = verdict;
    seed = mix32(seed);
    attempt += 1;
  }

  // Giving up honestly beats shipping an unfair region. The caller offers the
  // player a different seed rather than a silently bad one.
  return { ok: false, attempts: attempt, reason: lastVerdict.reason, seed: options.seed };
}

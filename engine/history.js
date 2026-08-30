// The city's history, for the statistics screen (slice 4.6).
//
// One integer sample a month, oldest first, capped. `plan.md` asks for the
// buffers to be **bounded and hashed**: bounded because a 200-year game must
// not grow without limit, hashed because two clients that disagree about the
// graphs disagree about the city, and because a save that restored a city with
// no history would show a player empty charts for a city they had played for
// twenty years.
//
// A rolling array rather than a ring with a start index. `shift()` is O(n) and
// n is 240, once a month — and a ring index is the sort of thing that is
// off by one in exactly the case nobody tests. Oldest-first also means
// canonical serialisation is the array order, with no rotation to get wrong.
//
// The pass is SILENT. Routine ticks do not emit events (CLAUDE.md): a sample is
// the most routine thing that happens, and an event per month inside a pinned
// fixture would be drift.

import { registerMonthly } from "./reducer.js";
import { idiv } from "../shared/idiv.js";
// In constants.js rather than here, because `engine/state.js` needs them for
// the hash and the deep copy and cannot import this file: history imports the
// reducer, and the reducer imports state.
import { HISTORY_CAP, HISTORY_FIELDS } from "./constants.js";

export { HISTORY_CAP, HISTORY_FIELDS };

/** The region's money, not a seat's. A per-seat history would be sixteen
 * histories, and every statistic in `gamedesign.md` §15.5 is about the city. */
function totalTreasury(state) {
  var total = 0;
  var i;
  for (i = 0; i < state.players.length; i += 1) total += state.players[i].treasury;
  return total;
}

export function sampleOf(state) {
  return {
    tick: state.tick,
    population: state.population,
    jobs: state.jobs,
    treasury: totalTreasury(state),
    landValue: state.civic.landValueAverage,
    pollution: state.civic.pollutionAverage,
    crime: state.civic.crimeAverage,
    congested: state.traffic.congested,
    demandR: state.demand.residential,
    demandC: state.demand.commercial,
    demandI: state.demand.industrial,
  };
}

export function historyPass(state) {
  state.history.samples.push(sampleOf(state));
  if (state.history.samples.length > HISTORY_CAP) state.history.samples.shift();
  return [];
}

/** Change over a window, as a percentage of where it started.
 *
 * Integer division, and a zero start reports zero rather than infinity — a city
 * going from no residents to four hundred has not grown by an infinite amount,
 * it has started. The client says "started" in words. */
export function changeOver(samples, field, months) {
  if (samples.length < 2) return 0;
  var last = samples[samples.length - 1][field];
  var firstIndex = samples.length - 1 - months;
  if (firstIndex < 0) firstIndex = 0;
  var first = samples[firstIndex][field];
  if (first === 0) return 0;
  return idiv((last - first) * 100, first < 0 ? -first : first);
}

// Last of the monthly systems, so a sample is the month as it ended rather than
// as it was halfway through.
registerMonthly("history", historyPass, 90);

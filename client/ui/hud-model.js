// The top bar, as data.
//
// Pure (plan.md §7.1). Everything the bar says is decided here and rendered by
// a thin DOM layer, so the awkward parts — a date that is off by a month, a
// treasury trend that reports growth while the city drains, the difference
// between the region's money and this seat's — are testable without a browser.

import { TICKS_PER_YEAR } from "../constants-mirror.js";

const MONTHS_PER_YEAR = 12;

/** Year and month from the tick count.
 *
 * Year 1, month 1 is the first tick. Starting at zero would be correct
 * arithmetic and wrong for a player, who has never lived through a year 0. */
export function cityDate(state) {
  const year = Math.floor(state.tick / TICKS_PER_YEAR) + 1;
  const within = state.tick % TICKS_PER_YEAR;
  const month = Math.floor((within * MONTHS_PER_YEAR) / TICKS_PER_YEAR) + 1;
  return { year, month };
}

/** Money with thin spaces between thousands, and a real minus sign for a debt.
 * Grouping is done by hand rather than by `toLocaleString` so the HUD reads the
 * same in every locale the game ships in — the currency here is not a real one
 * and does not want a locale's opinion about it. */
export function formatMoney(amount) {
  const negative = amount < 0;
  const digits = String(Math.abs(Math.round(amount)));
  let grouped = "";
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) grouped += " ";
    grouped += digits[i];
  }
  return `${negative ? "-" : ""}§${grouped}`;
}

function seatOf(state, seat) {
  return state.players.find((p) => p.seat === seat);
}

/**
 * @param previous optional `{ lastTreasury }` from the last time the bar was
 *   built, which is what turns a balance into a trend. Held by the caller
 *   rather than by the model, because a model that remembered would be state.
 */
export function topBar(state, seat, previous = {}) {
  const player = seatOf(state, seat);
  // The SEAT's money, not `state.treasury`. The two look alike, and picking the
  // wrong one is invisible in singleplayer and wrong the moment anyone joins.
  const treasury = player?.treasury ?? 0;
  const last = previous.lastTreasury;
  const trend = last === undefined || treasury === last ? 0 : (treasury > last ? 1 : -1);
  const { year, month } = cityDate(state);
  return {
    treasury,
    money: formatMoney(treasury),
    trend,
    population: state.population,
    year,
    month,
    tick: state.tick,
  };
}

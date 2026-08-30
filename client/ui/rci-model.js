// The three demand bars.
//
// Demand is REGIONAL (ruling 001) — residents and firms belong to the region,
// not to a seat — so these bars are the same for every player in a room, and
// that is deliberate rather than an oversight to fix later.

/** The scale the bars are drawn against. Demand is capped by the balance data
 * well inside this, so a full bar means "as much as this game produces", not
 * "as much as an integer can hold". */
const FULL = 400;

// `short` is the letter on the bar. It is NOT translated: R/C/I is the genre's
// notation, it appears that way in every screenshot in the design docs, and a
// localised initial would make the three bars unrecognisable to anyone who has
// played this kind of game before.
const BARS = [
  { key: "residential", labelKey: "zone.residential", short: "R" },
  { key: "commercial", labelKey: "zone.commercial", short: "C" },
  { key: "industrial", labelKey: "zone.industrial", short: "I" },
];

/** Three bars in a fixed order, each -1..1.
 *
 * The order is R, C, I everywhere in the design and in every screenshot of it.
 * The bars are read by position as much as by colour, so it is pinned by test. */
export function rciBars(state) {
  return BARS.map((bar) => {
    const raw = state.demand?.[bar.key] ?? 0;
    const value = Math.max(-1, Math.min(1, raw / FULL));
    return { ...bar, raw, value };
  });
}

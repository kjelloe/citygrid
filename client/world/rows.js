// Which houses are next door to each other (S23).
//
// A terrace is a property of a RUN, not of a lot: the houses share walls with
// the houses next door, and next door is another lot. The kit has been able to
// draw a terrace since S16a — `formFor` returns one at level 2 on a lot 26 m
// wide — and the decision was made one lot at a time, so a street of ordinary
// lots came out as detached boxes with gaps however tightly they were packed.
//
// Measured on the compare sheet's own city (seed 1003, 64 tiles, 40 years):
// **66 residential buildings, 35 of them at level 1**, on lots one or two tiles
// wide, every one free-standing — against a reference that is a district of
// terraced housing (S8b, Q168).
//
// Pure, and derived: no engine change, no hash, no era. The same city, drawn as
// the street it already is.

/** Lots are neighbours when they front the same street on the same side and
 * their edges are closer than this. Two metres of setback each side plus a
 * little: a terrace is houses that touch, and `4` is the gap a 2 m setback
 * leaves between two buildings on adjacent tiles. */
const JOIN_M = 4;

/** Residential only (zone 1). A shop beside a house is not a terrace, and a
 * works beside anything is a yard. */
const HOUSES = 1;

/** Which way along the frontage a lot runs: x for a north or south frontage,
 * z for an east or west one. */
function along(lot) {
  return lot.frontage === 0 || lot.frontage === 2
    ? { from: lot.x0, to: lot.x1, across: lot.z0 }
    : { from: lot.z0, to: lot.z1, across: lot.x0 };
}

/**
 * Marks each residential lot with the run it belongs to.
 *
 * `lot.row` is `{ left, right, size, index }` — whether a house abuts on either
 * side along the frontage, how long the run is, and where in it this lot sits.
 * A lot with no neighbour keeps `row` undefined, which is what every reader
 * already treats as "a lot on its own".
 *
 * Mutates, like the rest of `deriveLots`: the lots are built once at model time
 * and this is one more pass over them.
 */
export function markRows(lots, { joinM = JOIN_M } = {}) {
  const houses = lots.filter((lot) => lot.building?.zone === HOUSES && lot.facing !== false);
  // By street and side, so two sides of one road are two runs and two roads are
  // four — `street.id` is the corridor the lot fronts (A116), which is the
  // thing that makes "the same street" a question with an answer.
  const strips = new Map();
  for (const lot of houses) {
    const key = `${lot.street?.id ?? "none"}/${lot.frontage}`;
    if (!strips.has(key)) strips.set(key, []);
    strips.get(key).push(lot);
  }
  for (const strip of strips.values()) {
    const ordered = strip
      .map((lot) => ({ lot, span: along(lot) }))
      .sort((a, b) => a.span.from - b.span.from);
    let run = [];
    const close = () => {
      if (run.length >= 2) {
        run.forEach((entry, index) => {
          entry.lot.row = {
            left: index > 0,
            right: index < run.length - 1,
            size: run.length,
            index,
          };
        });
      }
      run = [];
    };
    for (const entry of ordered) {
      const last = run[run.length - 1];
      // The run breaks on a gap, and on a neighbour that is not beside this one
      // at all: two lots on one street can be a hundred metres apart ACROSS it
      // when the corridor bends, and a terrace of those would be two houses
      // facing each other.
      const joins = last
        && entry.span.from - last.span.to <= joinM
        && Math.abs(entry.span.across - last.span.across) <= joinM;
      if (!joins) close();
      run.push(entry);
    }
    close();
  }
  return lots;
}

// What happened while you were away, as rows (X4h, slice 5.4).
//
// The pure half of the history panel: `state.chronicle` is a ring of integers
// and a kind, and this turns it into sentences the panel renders — newest
// first, named seats, and a place where there is one.
//
// **Every key spelled as a literal.** ``t(`chronicle.${kind}`)`` is invisible
// to `test/reachability.test.js`'s scan, which is how three live inbox labels
// and all seven ping labels came to read as dead strings while they were on
// screen (X3b, twice).

import { seatName } from "./seats.js";
import { PLAYER_ACTIVE, PLAYER_AFK, PLAYER_REGENT, PLAYER_GONE } from "../../engine/constants.js";
import { APPROVED, DECLINED, EXPIRED, MOOT, ACKNOWLEDGED,
  REQUEST_NUISANCE } from "../../engine/requests.js";

/** One sentence per kind. A row that cannot be put into words is not shown —
 * the catalogue is the list of what this panel can say, and a kind missing
 * from it is a bug this table makes visible rather than a row reading
 * `chronicle.somethingNew`. */
export const CHRONICLE_LABELS = Object.freeze({
  seatJoined: "chronicle.seatJoined",
  seatLeft: "chronicle.seatLeft",
  requestFiled: "chronicle.requestFiled",
  requestResolved: "chronicle.requestResolved",
  // A withdrawal is an event of its own and not a resolution, so its sentence
  // hangs off the kind rather than off `how`. It is news to the OWNER: the
  // request waiting in their inbox is gone.
  requestWithdrawn: "chronicle.withdrawn",
  // A nuisance report is a different piece of news from a demolition request —
  // nothing can be made to happen by it (§25.4) — so it gets its own sentence
  // rather than the other one's with a noun swapped.
  reportFiled: "chronicle.reportFiled",
  disasterStruck: "chronicle.disasterStruck",
});

/** A status change is four different pieces of news, so it is four sentences
 * rather than one with a word swapped into it: "went away" and "was handed to
 * the deputy" are not the same event with a different noun. */
export const STATUS_LABELS = Object.freeze({
  [PLAYER_ACTIVE]: "chronicle.statusActive",
  [PLAYER_AFK]: "chronicle.statusAway",
  [PLAYER_REGENT]: "chronicle.statusRegent",
  [PLAYER_GONE]: "chronicle.statusGone",
});

/** And how a request ended. `0` is a resolution this build has no word for,
 * which is the same `undefined` the refusal table returns: a sentence about a
 * DIFFERENT ending is worse than none. */
export const RESOLUTION_LABELS = Object.freeze({
  [APPROVED]: "chronicle.approved",
  [DECLINED]: "chronicle.declined",
  [EXPIRED]: "chronicle.expired",
  [MOOT]: "chronicle.moot",
  [ACKNOWLEDGED]: "chronicle.acknowledged",
});

function labelFor(entry) {
  if (entry.kind === "seatStatus") return STATUS_LABELS[entry.status];
  if (entry.kind === "requestResolved") return RESOLUTION_LABELS[entry.how] ?? CHRONICLE_LABELS.requestResolved;
  if (entry.kind === "requestFiled" && entry.how === REQUEST_NUISANCE) return CHRONICLE_LABELS.reportFiled;
  return CHRONICLE_LABELS[entry.kind];
}

// Which endings may name the KIND of request they ended, which is a fact about
// the engine and so belongs here beside the sentences: `approved` and `moot`
// are only ever a demolition request (a report has nothing to approve and
// nothing to become moot about) and `acknowledged` only ever a report, so their
// sentences may say "the ground" and "your report". `declined` and `expired`
// reach BOTH — a standing "decline" answers either, and the clock runs on both
// — so theirs say "a request" and nothing about ground.

/**
 * The chronicle as rows, newest first.
 *
 * @returns `{ textKey, name, other, at, tick }` per row — `at` is `{x, y}`
 *   where the entry has a place and `undefined` where it has none, which is
 *   what makes a row clickable. The names are resolved here because the panel
 *   does not read the state, and the TEXT is a key because the model does not
 *   read the catalogue (the alert list's rule, and the same one).
 */
export function chronicleRows(state) {
  const rows = [];
  for (const entry of state?.chronicle?.entries ?? []) {
    const textKey = labelFor(entry);
    if (!textKey) continue;
    rows.push({
      textKey,
      name: seatName(state, entry.seat),
      other: entry.other > 0 ? seatName(state, entry.other) : undefined,
      at: entry.x >= 0 && entry.y >= 0 ? { x: entry.x, y: entry.y } : undefined,
      tick: entry.tick,
    });
  }
  return rows.reverse();
}

// What happened while you were away (X4h, slice 5.4).
//
// **The alert list is the activity feed** — that was X3b's finding, once
// `sim.onChange` stopped dropping every event another seat produced. What it is
// not is a RECORD: alerts live in the page, collapse by kind, expire after two
// sim-years and are capped at what fits on screen. A player who closed the tab
// and came back an hour later has none of them, because the page they lived in
// is gone.
//
// So the record is **state**. Every client derives it from the same commands in
// the same order, it rides the save, and a returning player gets it in the
// WELCOME like everything else about the city. Two histories that can disagree
// is worse than one that is short (the dev-log, "The activity feed, decided").
//
// **What it keeps, and what it deliberately does not.** Who came and went, who
// was handed to a deputy, what was asked of you and how it ended, and what the
// weather did. NOT what anybody built: a regent deputy lays a hundred streets
// in a year, and a log of them would be the city written twice — the city
// itself is the record of what was built, and it is already on screen.
//
// Integers and short strings only, like every other hashed field: no clock, no
// floats, nothing derived from a player's locale.

import { registerChronicler } from "./reducer.js";

/** How many entries the city keeps. Twenty-four is two years of monthly news at
 * the rate this list actually fills — seats joining, requests ending, a
 * disaster — and it is a RING: the oldest goes when the newest arrives, so a
 * long game cannot grow the save without bound. */
export var CHRONICLE_CAP = 24;

/**
 * The event kinds worth remembering, and nothing else.
 *
 * Spelled out rather than "everything with a seat on it": the list is the
 * decision, and a kind that starts appearing because somebody added an event
 * elsewhere would change what a save contains without anybody choosing it.
 * `test/chronicle.test.js` holds this against the engine's own event census.
 */
var WHO = {
  seatJoined: function (e) { return [e.seat, 0]; },
  seatLeft: function (e) { return [e.seat, 0]; },
  seatStatus: function (e) { return [e.seat, 0]; },
  // A request is BETWEEN two people and a row that named one of them is half a
  // sentence. Filed: who asked, and who was asked. Resolved: who answered, and
  // the other one — `resolvedBy` is X3b's field and it exists because an
  // owner's approval and a neighbour's derelict override are different news.
  requestFiled: function (e) { return [e.from, e.to]; },
  // A withdrawal is its own event kind rather than a resolution, so it needs
  // its own rule — and it had no row at all until this was written: the
  // `withdrawn` sentence existed in the panel's catalogue and `how` could
  // never hold that word, because nothing reaching the chronicle carried it.
  requestWithdrawn: function (e) { return [e.from, e.to]; },
  requestResolved: function (e) {
    var by = e.by > 0 ? e.by : e.to;
    return [by, by === e.from ? e.to : e.from];
  },
  // Nobody's: the weather is the city's news, and seat 0 reads as "the city" in
  // the panel.
  disasterStruck: function () { return [0, 0]; },
};

/** The event kinds worth remembering, which is the list above. Derived rather
 * than written twice: a kind with no rule for reading its seats would put a 0
 * on screen, which is what "Mayor 0 agreed to clear the ground" looked like on
 * the first run of the gate. */
export var CHRONICLED = Object.keys(WHO);

/**
 * Append whatever in `events` is worth remembering.
 *
 * Called by the reducer after a command succeeds, with the events that command
 * produced — so the deputy's commands are recorded on exactly the same terms as
 * a player's, which is the half "what did the deputy do while I was gone"
 * actually needs.
 */
export function chronicle(state, events) {
  if (!state.chronicle || !events) return;
  for (var i = 0; i < events.length; i += 1) {
    var event = events[i];
    if (!Object.hasOwn(WHO, event.kind)) continue;
    var who = WHO[event.kind](event);
    state.chronicle.entries.push({
      tick: state.tick,
      kind: event.kind,
      // Whose news it is, and whose else — read per kind by the table above
      // rather than by a chain of fallbacks that happens to work.
      seat: typeof who[0] === "number" ? who[0] : 0,
      other: typeof who[1] === "number" ? who[1] : 0,
      // Where, or -1: the panel makes a row with a place clickable, exactly as
      // the alert list does for a ping.
      x: typeof event.x === "number" ? event.x : -1,
      y: typeof event.z === "number" ? event.z : typeof event.y === "number" ? event.y : -1,
      // A seat's new status, which is a NUMBER (`PLAYER_AFK` and the rest).
      // 0 where it means nothing.
      status: typeof event.status === "number" ? event.status : 0,
      // And the short string that says which of its kind this is: how a
      // request ENDED (`approved`, `declined`, `withdrawn`, `expired`, `moot`,
      // `acknowledged`) or, on a filing, which kind was filed (`demolition`,
      // `nuisance`). One field read through `kind`, which every reader already
      // switches on — and a separate field from `status`, because
      // `requestResolved.status` is a string and `seatStatus.status` is an
      // integer (`PLAYER_AFK`): they share a name on the wire and they are not
      // the same idea, which is `two-fields-for-one-idea`.
      //
      // A filing needs it because "asked you about some ground" is the wrong
      // sentence for a noise complaint, and §25.4 is that a report is a civil
      // outlet and not a lever — a panel that called one a demolition request
      // would be arguing with the design.
      how: typeof event.status === "string" ? event.status
        : typeof event.request === "string" ? event.request : "",
    });
    if (state.chronicle.entries.length > CHRONICLE_CAP) state.chronicle.entries.shift();
  }
}

registerChronicler(chronicle);

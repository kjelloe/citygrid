// The request inbox, as data (X3b, slice 5.3).
//
// Five commands have had reducer handlers, tests and words in both catalogues
// since X3a and **no way for a player to issue them**; the three `request*`
// events are declared invisible in the event census for the same reason. This
// module decides what a row says and what may be done to it, and `hud.js` only
// draws — the same arrangement `overlays.js` and `options-model.js` have, and
// the reason any of it can be tested in node.
//
// **The sentence is the whole difficulty.** `status: APPROVED` happens two
// ways: the owner agreeing, and a neighbour clearing a ruin over their head
// under the derelict rule (X3c). X3b gave the record `resolvedBy` so that this
// file can tell them apart — being outvoted silently is the grief move in the
// other direction. So a row carries a KEY and its arguments rather than a
// string, and the catalogue holds the words in both languages.
//
// **The actions are the reducer's answer, not a guess.** Permission checks live
// in the reducer (CLAUDE.md) and a button it refuses is a lie told by the
// interface, so what is offered here is exactly what `engine/requests.js` will
// accept: the owner answers, the requester withdraws, and once a request is
// resolved nobody does anything.

import { TICKS_PER_MONTH } from "../../engine/constants.js";
import { seatName } from "./seats.js";
import { plural } from "../i18n.js";
import { REQUEST_POLICIES } from "../../engine/requests.js";

export const ACTIONS = Object.freeze({
  APPROVE: "approve",
  DECLINE: "decline",
  WITHDRAW: "withdraw",
});

/** Each action's label, written out rather than built as `inbox.${action}`.
 * A key assembled at runtime is invisible to `test/reachability.test.js`'s
 * scan — which duly reported all three as strings nothing can show — and an
 * i18n key nothing can find is one nobody can tell is dead. */
export const ACTION_LABELS = Object.freeze({
  [ACTIONS.APPROVE]: "inbox.approve",
  [ACTIONS.DECLINE]: "inbox.decline",
  [ACTIONS.WITHDRAW]: "inbox.withdraw",
});

const PENDING = "pending";

/** Was this cleared over the owner's head? `resolvedBy` is the ANSWERER, so a
 * request answered by anybody other than its recipient is the derelict
 * override — the only path on which that is possible (X3c). */
function wasForced(request) {
  return request.status === "approved"
    && request.resolvedBy > 0 && request.resolvedBy !== request.to;
}

/**
 * The sentence for one row, from the point of view of `seat`.
 *
 * Every branch names the OTHER party rather than the actor, because a row in my
 * inbox is about somebody else's act; the only exception is a forced clearance,
 * where what the owner needs to read is that it happened at all.
 */
function textKeyFor(request, seat, tiles) {
  const mine = request.from === seat;
  if (request.status === PENDING) {
    // **One tile is not "1 tiles"** — and since M11 that is one rule rather
    // than a pair of keys chosen here. `plural()` picks `key.one` at exactly
    // one and `key` otherwise, and `test/i18n.test.js` holds every counted
    // string in the catalogue to having both forms, so the next one cannot
    // ship without them.
    if (request.kind === "nuisance") {
      return plural(mine ? "inbox.sent.nuisance" : "inbox.waiting.nuisance", tiles);
    }
    return plural(mine ? "inbox.sent.demolition" : "inbox.waiting.demolition", tiles);
  }
  if (wasForced(request)) return mine ? "inbox.settled.youCleared" : "inbox.settled.wasCleared";
  switch (request.status) {
    case "approved": return mine ? "inbox.settled.theyApproved" : "inbox.settled.youApproved";
    case "declined": return mine ? "inbox.settled.theyDeclined" : "inbox.settled.youDeclined";
    case "withdrawn": return mine ? "inbox.settled.youWithdrew" : "inbox.settled.theyWithdrew";
    case "acknowledged": return mine ? "inbox.settled.theyNoted" : "inbox.settled.youNoted";
    case "expired": return "inbox.settled.expired";
    case "moot": return "inbox.settled.moot";
    default: return "inbox.settled.expired";
  }
}

function rowFor(state, request, seat) {
  const mine = request.from === seat;
  const other = mine ? request.to : request.from;
  const pending = request.status === PENDING;
  const actions = [];
  if (pending && request.to === seat) actions.push(ACTIONS.APPROVE, ACTIONS.DECLINE);
  if (pending && request.from === seat) actions.push(ACTIONS.WITHDRAW);
  return {
    id: request.id,
    kind: request.kind,
    status: request.status,
    // Carried, never re-sanitised: player text is capped and canonicalised on
    // the way INTO hashed state (X3a), and a second rule here could disagree
    // with the first. The panel renders it as plain text.
    title: request.title,
    reason: request.reason,
    offer: request.offer,
    createdTick: request.createdTick,
    tiles: request.runs.length > 0 ? runLength(request.runs) : 0,
    otherSeat: other,
    otherName: seatName(state, other),
    forced: wasForced(request),
    textKey: textKeyFor(request, seat, runLength(request.runs)),
    expiresInMonths: pending
      ? Math.max(0, Math.floor((request.expiresTick - state.tick) / TICKS_PER_MONTH))
      : 0,
    actions,
  };
}

/** How many tiles a run-length-encoded list covers. Runs are `[start, length]`
 * pairs (`shared/grid.js`), so the count is every other entry. */
function runLength(runs) {
  let tiles = 0;
  for (let i = 1; i < runs.length; i += 2) tiles += runs[i];
  return tiles;
}

/**
 * One seat's inbox: what it must answer, what it is waiting on, and what has
 * been settled. Nothing another seat filed about a third party appears at all.
 *
 * Waiting is **oldest first**, because a deadline is a queue; the rest are
 * newest first, because what just happened is what a player is looking for.
 */
export function inboxFor(state, seat) {
  const waiting = [];
  const sent = [];
  const settled = [];
  for (const request of state?.requests ?? []) {
    if (request.from !== seat && request.to !== seat) continue;
    const row = rowFor(state, request, seat);
    if (request.status !== PENDING) settled.push(row);
    else if (request.to === seat) waiting.push(row);
    else sent.push(row);
  }
  waiting.sort((a, b) => a.createdTick - b.createdTick);
  sent.sort((a, b) => a.createdTick - b.createdTick);
  settled.sort((a, b) => b.createdTick - a.createdTick);
  return { waiting, sent, settled };
}

/** Each standing answer's label, spelled out — a key built as
 * `inbox.policy.${policy}` is invisible to `test/reachability.test.js`'s scan,
 * which is how `inbox.approve` and all seven ping labels came to read as
 * strings nothing can show while they were on screen. */
export const POLICY_LABELS = Object.freeze({
  manual: "inbox.policy.manual",
  approve: "inbox.policy.approve",
  decline: "inbox.policy.decline",
});

/**
 * What this seat has standing, and what else it could have (X3b).
 *
 * The control belongs in the inbox because this is the panel about what
 * happens to requests you get — and it is one seat's own, always: nobody sets
 * anybody else's standing answer, which is why there is no seat argument on
 * the command.
 */
export function policyChoices(state, seat) {
  const player = state?.players?.find((p) => p.seat === seat);
  const current = player?.requestPolicy ?? "manual";
  return REQUEST_POLICIES.map((policy) => ({
    policy,
    labelKey: POLICY_LABELS[policy],
    chosen: policy === current,
  }));
}

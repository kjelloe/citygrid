// Asking, instead of taking (X3a, slice 5.3; gamedesign.md §25.3, §25.4).
//
// `canDemolish` is the rule the whole ownership design rests on: what you did
// not build is not yours to destroy. A rule like that is only liveable if there
// is a way to ASK, and until this slice there was not one — five commands had
// constants, a record shape in `state.requests`, a place in the hash and a line
// in `test/omissions.test.js` saying they belonged to slice 5.3, and no handler
// anywhere. That is the N11 failure in its multiplayer form.
//
// A request is hashed state, not chat (§25.3): it is part of the game record,
// every client agrees about it, and a save keeps it. It carries player-authored
// text, which makes it untrusted input and hashed state at once — capped,
// stripped and canonicalised on the way in, through the same `sanitiseText`
// every other name goes through.
//
// **One record, two kinds.** A nuisance report "uses the same channel" (§25.4)
// — the same inbox, the same per-pair cap, the same clock — and differs in
// exactly one way: it cannot force a change, so it cannot be approved. That is
// one `kind` field on the record rather than a second array, because every
// reader asks the same questions of both (who sent it, where, when does it
// lapse) and only the answer to "may this be approved" differs.
//
// What is NOT here, deliberately: `setRequestPolicy` is slice 5.4's and the
// deputy answers nothing (X4 builds the standing policy), and §25.4's derelict
// override — a neighbour approving the demolition of a ruin against its owner's
// wishes — needs a clock the building record does not have. Both are written in
// `workitems-multiplayer.md` rather than half-built here.

import { register, ok, fail, registerMonthly } from "./reducer.js";
import { RESULT, LIMITS } from "../shared/protocol.js";
import {
  CMD_REQUEST_DEMOLITION, CMD_RESOLVE_REQUEST, CMD_WITHDRAW_REQUEST,
  CMD_REPORT_NUISANCE, CMD_PING,
} from "./commands.js";
import { TICKS_PER_MONTH } from "./constants.js";
import { canAct, isSeat, playerAt, buildingAt } from "./permissions.js";
import { bulldozeInto } from "./build-commands.js";
import { begin, commit, failed, affordable } from "./transaction.js";
import { cellsFromRuns, hasNet, NETWORKS } from "./network.js";
import { isInt, isIntArray, sanitiseText } from "./validate.js";

export var REQUEST_DEMOLITION = "demolition";
export var REQUEST_NUISANCE = "nuisance";

export var PENDING = "pending";
export var APPROVED = "approved";
export var DECLINED = "declined";
export var WITHDRAWN = "withdrawn";
export var EXPIRED = "expired";
export var MOOT = "moot";
export var ACKNOWLEDGED = "acknowledged";

export function requestById(state, id) {
  for (var i = 0; i < state.requests.length; i += 1) {
    if (state.requests[i].id === id) return state.requests[i];
  }
  return undefined;
}

function pendingBetween(state, from, to) {
  var count = 0;
  for (var i = 0; i < state.requests.length; i += 1) {
    var r = state.requests[i];
    if (r.status === PENDING && r.from === from && r.to === to) count += 1;
  }
  return count;
}

/** The one seat a request is addressed to, read off the GROUND rather than
 * taken from the command: a recipient the sender chooses is a recipient the
 * sender can get wrong, and the whole point of the record is that the owner of
 * the thing is the one who answers for it.
 *
 * Returns the seat, or a result code saying why these tiles are not one
 * person's to answer for. */
function recipientOf(state, actor, indices) {
  var to = 0;
  for (var i = 0; i < indices.length; i += 1) {
    var owner = state.tiles.owner[indices[i]];
    if (!isSeat(owner)) continue;
    if (owner === actor) return RESULT.INVALID;   // yours: bulldoze it yourself
    if (to !== 0 && owner !== to) return RESULT.INVALID;
    to = owner;
  }
  if (to === 0) return RESULT.INVALID;
  return to;
}

/** Is there anything left on these tiles for the owner to remove? A request
 * whose subject is gone is moot rather than refused (§25.3). */
function anythingToRemove(state, request) {
  var indices = cellsFromRuns(state, request.runs, LIMITS.CELLS_PER_COMMAND);
  if (!indices) return false;
  for (var i = 0; i < indices.length; i += 1) {
    var index = indices[i];
    if (state.tiles.owner[index] !== request.to) continue;
    if (buildingAt(state, index)) return true;
    if (state.tiles.zone[index] !== 0) return true;
    for (var key in NETWORKS) {
      if (!Object.hasOwn(NETWORKS, key)) continue;
      if (hasNet(state.tiles[NETWORKS[key].layer][index])) return true;
    }
  }
  return false;
}

function file(state, command, kind) {
  var acting = canAct(state, command.actor);
  if (acting !== RESULT.OK) return fail(acting);
  if (!isIntArray(command.runs, LIMITS.CELLS_PER_COMMAND)) return fail(RESULT.INVALID);
  var indices = cellsFromRuns(state, command.runs, LIMITS.CELLS_PER_COMMAND);
  if (!indices || indices.length === 0) return fail(RESULT.INVALID);

  var to = recipientOf(state, command.actor, indices);
  if (typeof to !== "number") return fail(to);
  if (!playerAt(state, to)) return fail(RESULT.INVALID);

  // The inbox is a channel, and a channel with no cap is a weapon (§25.3). Both
  // kinds count against it: a player buried under nuisance reports cannot read
  // the demolition request that mattered.
  if (pendingBetween(state, command.actor, to) >= LIMITS.PENDING_REQUESTS_PER_PAIR) {
    return fail(RESULT.RATE_LIMITED);
  }

  // A nuisance report cannot force a change, so it cannot carry an inducement
  // either — there is nothing to buy.
  var offer = kind === REQUEST_NUISANCE || !isInt(command.offer) || command.offer < 0
    ? 0 : command.offer;

  var request = {
    id: state.nextId,
    kind: kind,
    from: command.actor,
    to: to,
    runs: command.runs.slice(),
    title: sanitiseText(command.title, LIMITS.TITLE_BYTES),
    reason: state.options.freeTextReasons ? sanitiseText(command.reason, LIMITS.REASON_BYTES) : "",
    offer: offer,
    createdTick: state.tick,
    expiresTick: state.tick + state.options.requestExpiryMonths * TICKS_PER_MONTH,
    status: PENDING,
  };
  state.nextId += 1;
  state.requests.push(request);
  return ok([{ kind: "requestFiled", id: request.id, from: request.from, to: request.to, request: request.kind }]);
}

register(CMD_REQUEST_DEMOLITION, function requestDemolition(state, command) {
  return file(state, command, REQUEST_DEMOLITION);
});

register(CMD_REPORT_NUISANCE, function reportNuisance(state, command) {
  return file(state, command, REQUEST_NUISANCE);
});

register(CMD_WITHDRAW_REQUEST, function withdrawRequest(state, command) {
  var request = requestById(state, command.id);
  if (!request || request.status !== PENDING) return fail(RESULT.INVALID);
  if (request.from !== command.actor) return fail(RESULT.NOT_OWNER);
  request.status = WITHDRAWN;
  return ok([{ kind: "requestWithdrawn", id: request.id }]);
});

/**
 * The owner's answer. Approval "executes the demolition in one transaction,
 * paid for by the requester, and transfers the compensation" (§25.3) — all
 * three or none of them, which is what makes an approval safe to give.
 *
 * The transaction is the OWNER's, because `canDemolish` must see the owner; its
 * charge is moved to the requester here rather than inside `commit`, which
 * knows one purse. The owner is therefore never out of pocket for agreeing, and
 * never has to be able to afford what they are agreeing to.
 */
register(CMD_RESOLVE_REQUEST, function resolveRequest(state, command) {
  var request = requestById(state, command.id);
  if (!request || request.status !== PENDING) return fail(RESULT.INVALID);
  if (request.to !== command.actor) return fail(RESULT.NOT_OWNER);

  // A nuisance report has no second answer: acknowledging it is all the channel
  // can do, which is the design's point — a civil outlet, not a lever (§25.4).
  if (request.kind === REQUEST_NUISANCE) {
    request.status = ACKNOWLEDGED;
    return ok([{ kind: "requestResolved", id: request.id, status: request.status }]);
  }

  if (!command.approve) {
    request.status = DECLINED;
    return ok([{ kind: "requestResolved", id: request.id, status: request.status }]);
  }

  var indices = cellsFromRuns(state, request.runs, LIMITS.CELLS_PER_COMMAND);
  if (!indices) return fail(RESULT.INVALID);
  var tx = begin(state, request.to);
  bulldozeInto(tx, indices);
  if (failed(tx)) return fail(tx.result);

  var bill = tx.cost + request.offer;
  if (!affordable(state, request.from, bill)) return fail(RESULT.NO_FUNDS);
  // The owner's transaction, with the price taken out of it: the ground is
  // cleared under the owner's permission and billed to the requester below.
  tx.cost = 0;
  var done = commit(tx);
  if (done.result !== RESULT.OK) return fail(done.result);

  playerAt(state, request.from).treasury -= bill;
  playerAt(state, request.to).treasury += request.offer;
  request.status = APPROVED;
  return ok([
    { kind: "requestResolved", id: request.id, status: request.status },
    { kind: "built", actor: request.to, tiles: done.tiles, cost: bill },
  ]);
});

/** A camera gesture, not a change. It is a command so that it crosses the wire
 * in the same order as everything else — "look at this" arriving before the
 * thing it is about would be a different conversation — and it writes nothing
 * at all, which is why `test/requests.test.js` pins the hash across it. */
register(CMD_PING, function ping(state, command) {
  var acting = canAct(state, command.actor);
  if (acting !== RESULT.OK) return fail(acting);
  if (!isInt(command.x) || !isInt(command.z)) return fail(RESULT.INVALID);
  return ok([{ kind: "ping", actor: command.actor, x: command.x, z: command.z }]);
});

/** The clock and the quiet endings. Pending requests lapse on the option's
 * schedule rather than on somebody's memory, and one whose subject has already
 * gone becomes moot rather than sitting in an inbox as a question nobody can
 * answer. */
function requestPass(state) {
  var events = [];
  for (var i = 0; i < state.requests.length; i += 1) {
    var request = state.requests[i];
    if (request.status !== PENDING) continue;
    if (request.kind === REQUEST_DEMOLITION && !anythingToRemove(state, request)) {
      request.status = MOOT;
      events.push({ kind: "requestResolved", id: request.id, status: request.status });
      continue;
    }
    if (state.tick >= request.expiresTick) {
      request.status = EXPIRED;
      events.push({ kind: "requestResolved", id: request.id, status: request.status });
    }
  }
  return events;
}

// After `civic` and before `development`: a request is answered against the city
// as it stood when the month began, not against lots built halfway through it.
registerMonthly("requests", requestPass, 25);

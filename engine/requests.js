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
  CMD_REPORT_NUISANCE, CMD_PING, CMD_SET_REQUEST_POLICY,
} from "./commands.js";
import {
  TICKS_PER_MONTH, TICKS_PER_YEAR, FLAG_RUINED,
  PLAYER_REGENT, PLAYER_GONE, OWNER_COMMONS,
} from "./constants.js";
import { canAct, isSeat, playerAt, buildingAt } from "./permissions.js";
import { bulldozeInto } from "./build-commands.js";
import { begin, commit, failed, affordable } from "./transaction.js";
import { cellsFromRuns, hasNet, NETWORKS } from "./network.js";
import { isInt, isIntArray, sanitiseText } from "./validate.js";

/** What a ping can say (X3b). A **closed** vocabulary, for the same reason the
 * quest condition language is closed (`engine/quests.js`): an open one in a
 * message that reaches every client is a way to put somebody else's words
 * through all of them. Each has had words in both catalogues since X3a and no
 * way to send one.
 *
 * `look` is the default, because pointing at something is what a ping IS and a
 * player who just clicked a tile has not chosen a sentence. */
export var PING_MESSAGES = ["look", "help", "building", "remove", "working", "fire", "thanks"];

export function isPingMessage(value) {
  for (var i = 0; i < PING_MESSAGES.length; i += 1) {
    if (PING_MESSAGES[i] === value) return true;
  }
  return false;
}

/** What a seat can decide IN ADVANCE about requests addressed to it (X3b).
 *
 * `player.requestPolicy` has been born `"manual"`, copied and hashed since Wave
 * 0 and **nothing has ever set it or read it**, while `CMD_SET_REQUEST_POLICY`
 * has had a constant and no handler for just as long — a dead field and a dead
 * command, two halves of one missing feature.
 *
 * Closed, for the same reason a ping's message is: a policy the monthly pass
 * does not know how to apply would sit in hashed state doing nothing, which is
 * exactly where this field started. `manual` is the default and means what it
 * says — the request waits for a person.
 */
export var REQUEST_POLICIES = ["manual", "approve", "decline"];

export function isRequestPolicy(value) {
  for (var i = 0; i < REQUEST_POLICIES.length; i += 1) {
    if (REQUEST_POLICIES[i] === value) return true;
  }
  return false;
}

export var REQUEST_DEMOLITION = "demolition";
export var REQUEST_NUISANCE = "nuisance";

export var PENDING = "pending";
export var APPROVED = "approved";
export var DECLINED = "declined";
export var WITHDRAWN = "withdrawn";
export var EXPIRED = "expired";
export var MOOT = "moot";
export var ACKNOWLEDGED = "acknowledged";

/**
 * A tile became a ruin (X3c). Called where `FLAG_RUINED` is SET — by fire and
 * by a disaster — because the flag and the clock are one fact and two writers
 * of one fact drift.
 *
 * Kept sorted by tile: canonical serialisation never depends on the order
 * things happened (CLAUDE.md).
 */
export function markDerelict(state, tile) {
  for (var i = 0; i < state.derelicts.length; i += 1) {
    if (state.derelicts[i].tile === tile) return;
  }
  state.derelicts.push({ tile: tile, sinceTick: state.tick });
  state.derelicts.sort(function byTile(a, b) { return a.tile - b.tile; });
}

/**
 * The ruins among these tiles that are no longer ruins, after an edit (X3c).
 *
 * One function, two callers — `runArea`'s bulldoze and this file's own approved
 * demolition — because the first version cleared the clock in only one of them
 * and a ruin removed by a neighbour's request kept its entry for ever. Read
 * from the COMMITTED flags rather than staged during the edit: a transaction
 * that is rejected after staging must leave the list as it found it.
 */
export function forgetClearedRuins(state, indices) {
  for (var i = 0; i < indices.length; i += 1) {
    if ((state.tiles.flags[indices[i]] & FLAG_RUINED) === 0) clearDerelict(state, indices[i]);
  }
}

/** And stopped being one: bulldozed, or built on again. */
export function clearDerelict(state, tile) {
  for (var i = 0; i < state.derelicts.length; i += 1) {
    if (state.derelicts[i].tile !== tile) continue;
    state.derelicts.splice(i, 1);
    return;
  }
}

/** How long this tile has been a ruin, or -1 if it is not one. */
export function derelictSince(state, tile) {
  for (var i = 0; i < state.derelicts.length; i += 1) {
    if (state.derelicts[i].tile === tile) return state.derelicts[i].sinceTick;
  }
  return -1;
}

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
    // 0 until somebody answers (X3b): a pending request has no answerer, and
    // the clock is nobody — an expiry recorded as a seat would be a sentence
    // blaming a player for a deadline.
    resolvedBy: 0,
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
  request.resolvedBy = command.actor;
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
/**
 * May the REQUESTER clear this themselves? (X3c, gamedesign §25.4.)
 *
 * "A building abandoned for longer than a set number of years may have its
 * demolition approved on a neighbour's request even against the owner's
 * wishes." The one grief move ownership would otherwise make unanswerable is
 * leaving a ruin to rot against a neighbour's park for ever.
 *
 * Every target tile has to qualify, and the YOUNGEST answers: a request that
 * mixes a five-year ruin with yesterday's is a request about yesterday's.
 */
function derelictEnough(state, request) {
  var indices = cellsFromRuns(state, request.runs, LIMITS.CELLS_PER_COMMAND);
  if (!indices || indices.length === 0) return false;
  var needed = state.options.derelictYears * TICKS_PER_YEAR;
  for (var i = 0; i < indices.length; i += 1) {
    var since = derelictSince(state, indices[i]);
    if (since < 0) return false;
    if (state.tick - since < needed) return false;
  }
  return true;
}

register(CMD_RESOLVE_REQUEST, function resolveRequest(state, command) {
  var request = requestById(state, command.id);
  if (!request || request.status !== PENDING) return fail(RESULT.INVALID);
  // The derelict override: the one case where somebody other than the owner may
  // answer. Checked before the ownership refusal, and refused with the CLOCK's
  // reason rather than the ground's when the ruin is too young — "that belongs
  // to somebody else" tells a player to give up on ground they are entitled to.
  if (request.to !== command.actor) {
    if (request.from !== command.actor || request.kind !== REQUEST_DEMOLITION) {
      return fail(RESULT.NOT_OWNER);
    }
    if (!derelictEnough(state, request)) {
      return fail(anyDerelict(state, request) ? RESULT.NOT_DERELICT : RESULT.NOT_OWNER);
    }
  }

  // A nuisance report has no second answer: acknowledging it is all the channel
  // can do, which is the design's point — a civil outlet, not a lever (§25.4).
  if (request.kind === REQUEST_NUISANCE) {
    request.status = ACKNOWLEDGED;
    request.resolvedBy = command.actor;
    return ok([{ kind: "requestResolved", id: request.id, status: request.status }]);
  }

  if (!command.approve) {
    request.status = DECLINED;
    request.resolvedBy = command.actor;
    return ok([{ kind: "requestResolved", id: request.id, status: request.status }]);
  }

  var done = approveRequest(state, request, command.actor);
  if (done.result !== RESULT.OK) return fail(done.result);
  return ok(done.events);
});

/** Clear the ground and move the money, for an approval however it arrived.
 *
 * One body, because a standing policy approves exactly as a person does (X3b)
 * and two copies of "bulldoze, bill, pay" would be two rules that can disagree
 * about who paid for what. `by` is the ANSWERER — the owner on both ordinary
 * paths and the requester on the derelict override (X3c).
 *
 * Answers `{ result, events }` rather than refusing: the monthly pass calls it
 * for a seat that is not looking, and a request it cannot honour has to be left
 * exactly as it was. "I tried" and "I did" are the same to the caller.
 */
function approveRequest(state, request, by) {
  var indices = cellsFromRuns(state, request.runs, LIMITS.CELLS_PER_COMMAND);
  if (!indices) return { result: RESULT.INVALID, events: [] };
  var tx = begin(state, request.to);
  bulldozeInto(tx, indices);
  if (failed(tx)) return { result: tx.result, events: [] };

  var bill = tx.cost + request.offer;
  if (!affordable(state, request.from, bill)) return { result: RESULT.NO_FUNDS, events: [] };
  // The owner's transaction, with the price taken out of it: the ground is
  // cleared under the owner's permission and billed to the requester below.
  tx.cost = 0;
  var committed = commit(tx);
  if (committed.result !== RESULT.OK) return { result: committed.result, events: [] };

  forgetClearedRuins(state, indices);
  playerAt(state, request.from).treasury -= bill;
  playerAt(state, request.to).treasury += request.offer;
  request.status = APPROVED;
  request.resolvedBy = by;
  return {
    result: RESULT.OK,
    events: [
      { kind: "requestResolved", id: request.id, status: request.status },
      { kind: "built", actor: request.to, tiles: committed.tiles, cost: bill },
    ],
  };
}

/** Is any of this request's ground a ruin at all? The difference between "not
 * yet" and "that is not yours", which is the difference between waiting and
 * giving up. */
function anyDerelict(state, request) {
  var indices = cellsFromRuns(state, request.runs, LIMITS.CELLS_PER_COMMAND);
  if (!indices) return false;
  for (var i = 0; i < indices.length; i += 1) {
    if (derelictSince(state, indices[i]) >= 0) return true;
  }
  return false;
}

/** A camera gesture, not a change. It is a command so that it crosses the wire
 * in the same order as everything else — "look at this" arriving before the
 * thing it is about would be a different conversation — and it writes nothing
 * at all, which is why `test/requests.test.js` pins the hash across it. */
register(CMD_SET_REQUEST_POLICY, function setRequestPolicy(state, command) {
  var acting = canAct(state, command.actor);
  if (acting !== RESULT.OK) return fail(acting);
  if (!isRequestPolicy(command.policy)) return fail(RESULT.INVALID);
  // One seat's own, always: nobody sets anybody else's standing answer, which
  // is why there is no `seat` on this command to be wrong about.
  playerAt(state, command.actor).requestPolicy = command.policy;
  return ok([]);
});

register(CMD_PING, function ping(state, command) {
  var acting = canAct(state, command.actor);
  if (acting !== RESULT.OK) return fail(acting);
  if (!isInt(command.x) || !isInt(command.z)) return fail(RESULT.INVALID);
  // One of the seven, or nothing at all. Refused rather than passed through: a
  // message the catalogue has no words for reaches the other player as a raw
  // key, which is what `t()` returning its own argument looks like on screen.
  var message = command.message === undefined ? "look" : command.message;
  if (!isPingMessage(message)) return fail(RESULT.INVALID);
  return ok([{ kind: "ping", actor: command.actor, x: command.x, z: command.z, message: message }]);
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
    // **A standing answer, given at the month** (X3b). A player who is not
    // looking still answers, and the month is when: a request is answered
    // against the city as it stood when it began, which is this pass's own rule
    // and what keeps an auto-answer in the same order on every machine.
    var owner = playerAt(state, request.to);
    var policy = owner ? owner.requestPolicy : "manual";
    if (policy === "decline") {
      request.status = DECLINED;
      request.resolvedBy = request.to;
      events.push({ kind: "requestResolved", id: request.id, status: request.status });
      continue;
    }
    if (policy === "approve") {
      // §25.4: acknowledging a complaint is all the channel can do, so a
      // standing "approve" must never turn one into a demolition.
      if (request.kind === REQUEST_NUISANCE) {
        request.status = ACKNOWLEDGED;
        request.resolvedBy = request.to;
        events.push({ kind: "requestResolved", id: request.id, status: request.status });
        continue;
      }
      var answered = approveRequest(state, request, request.to);
      if (answered.result === RESULT.OK) {
        for (var e = 0; e < answered.events.length; e += 1) events.push(answered.events[e]);
        continue;
      }
      // Anything else leaves it exactly as it was: a requester who cannot pay
      // does not get the ground cleared for free, and a request nothing
      // happened to must not be marked answered.
    }
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

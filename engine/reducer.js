// apply(state, command) — the one function every outcome flows through.
//
// It MUTATES the state it is given and returns a result envelope. Callers that
// need a snapshot call copyState first. The pure-copy alternative was measured
// against the cadence and rejected: a whole-state copy is ~300 KB at 128x128,
// and at sixteen fast ticks per second that is five megabytes a second of
// memcpy to no purpose. Determinism is unaffected — same state, same command,
// same outcome, always — and placement already gets all-or-nothing behaviour
// from the staging buffer rather than from copying the world.
//
// Events are returned, not stored. Storing them would grow hashed state
// without bound over a persistent room's lifetime (ruling 002).

import { RESULT } from "../shared/protocol.js";
import { CMD_TICK, CMD_JOIN, CMD_LEAVE, CMD_SET_STATUS } from "./commands.js";
import { canAct, playerAt, isSeat } from "./permissions.js";
import { PLAYER_ACTIVE, PLAYER_GONE, SEAT_MAX, TICKS_PER_MONTH, TICKS_PER_YEAR } from "./constants.js";
import { nextU32 } from "../shared/prng.js";
import { fdiv, imod } from "../shared/idiv.js";
import { isInt, isIntInRange, sanitiseText } from "./validate.js";
import { LIMITS } from "../shared/protocol.js";

export function ok(events) {
  return { result: RESULT.OK, events: events ? events : [] };
}

export function fail(result) {
  return { result: result, events: [] };
}

/** The handler table. A command with no handler is INVALID rather than
 * ignored: a silently dropped command is a desync waiting to happen, because
 * one build might handle it and another might not. */
var HANDLERS = {};

export function register(type, handler) {
  HANDLERS[type] = handler;
}

/** Commands that may arrive from someone who is not yet a player: the clock,
 * which is not a player at all, and JOIN, which is how one becomes a player.
 * Both validate their own arguments in the handler. */
function needsExistingActor(type) {
  return type !== CMD_TICK && type !== CMD_JOIN;
}

export function apply(state, command) {
  if (!command || typeof command.type !== "string") return fail(RESULT.INVALID);
  // Own properties only. A lookup straight into the table would resolve
  // "constructor" and "__proto__" to inherited members of Object.prototype,
  // and a client that sends {type:"constructor"} would have it called as a
  // handler. Found by tools/chaos.mjs on its first run.
  if (!Object.hasOwn(HANDLERS, command.type)) return fail(RESULT.INVALID);
  var handler = HANDLERS[command.type];
  if (typeof handler !== "function") return fail(RESULT.INVALID);
  if (needsExistingActor(command.type)) {
    var allowed = canAct(state, command.actor);
    if (allowed !== RESULT.OK) return fail(allowed);
  }
  return handler(state, command);
}

// --- the clock -------------------------------------------------------------

/** Subsystems register here rather than the tick handler importing them, so
 * that adding a system never edits the reducer. Order is explicit and part of
 * the determinism contract. */
var FAST_SYSTEMS = [];
var MONTH_SYSTEMS = [];
var YEAR_SYSTEMS = [];

export function registerFast(name, fn) { FAST_SYSTEMS.push({ name: name, fn: fn }); }
export function registerMonthly(name, fn) { MONTH_SYSTEMS.push({ name: name, fn: fn }); }
export function registerYearly(name, fn) { YEAR_SYSTEMS.push({ name: name, fn: fn }); }

export function systemNames() {
  var names = [];
  var i;
  for (i = 0; i < FAST_SYSTEMS.length; i += 1) names.push("fast:" + FAST_SYSTEMS[i].name);
  for (i = 0; i < MONTH_SYSTEMS.length; i += 1) names.push("month:" + MONTH_SYSTEMS[i].name);
  for (i = 0; i < YEAR_SYSTEMS.length; i += 1) names.push("year:" + YEAR_SYSTEMS[i].name);
  return names;
}

function runSystems(list, state, events) {
  for (var i = 0; i < list.length; i += 1) {
    var produced = list[i].fn(state);
    if (produced) {
      for (var k = 0; k < produced.length; k += 1) events.push(produced[k]);
    }
  }
}

register(CMD_TICK, function tick(state) {
  var events = [];
  state.tick += 1;
  runSystems(FAST_SYSTEMS, state, events);
  if (state.tick % TICKS_PER_MONTH === 0) runSystems(MONTH_SYSTEMS, state, events);
  if (state.tick % TICKS_PER_YEAR === 0) runSystems(YEAR_SYSTEMS, state, events);
  return ok(events);
});

export function monthOf(tick) {
  return imod(fdiv(tick, TICKS_PER_MONTH), 12);
}

export function yearOf(tick) {
  return fdiv(tick, TICKS_PER_YEAR);
}

// --- seats -----------------------------------------------------------------

register(CMD_JOIN, function join(state, command) {
  if (!isInt(command.seat) || !isSeat(command.seat)) return fail(RESULT.INVALID);
  if (command.seat > state.options.seats) return fail(RESULT.INVALID);
  var existing = playerAt(state, command.seat);
  if (existing) {
    // Reclaiming a seat after an absence: the land, the inbox and the money
    // are all still theirs (ruling 002).
    existing.status = PLAYER_ACTIVE;
    existing.lastSeenTick = state.tick;
    return ok([{ kind: "seatReclaimed", seat: command.seat }]);
  }
  state.players.push({
    seat: command.seat,
    // A player name is untrusted text and hashed state at once (ruling from P8).
    name: sanitiseText(command.name, LIMITS.NAME_BYTES),
    colour: isIntInRange(command.colour, 0, SEAT_MAX) ? command.colour : command.seat,
    status: PLAYER_ACTIVE,
    treasury: state.options.startingTreasury,
    requestPolicy: "manual",
    joinedTick: state.tick,
    lastSeenTick: state.tick,
  });
  // Seats are kept in seat order so that iteration is stable regardless of
  // arrival order — two engines must walk players identically.
  state.players.sort(function bySeat(a, b) { return a.seat - b.seat; });
  return ok([{ kind: "seatJoined", seat: command.seat }]);
});

register(CMD_LEAVE, function leave(state, command) {
  var player = playerAt(state, command.actor);
  if (!player) return fail(RESULT.INVALID);
  player.status = PLAYER_GONE;
  player.lastSeenTick = state.tick;
  return ok([{ kind: "seatLeft", seat: command.actor }]);
});

register(CMD_SET_STATUS, function setStatus(state, command) {
  var player = playerAt(state, command.actor);
  if (!player) return fail(RESULT.INVALID);
  // `undefined < 0` and `undefined > 3` are both false, so a bare range check
  // would accept undefined and write it into hashed state.
  if (!isIntInRange(command.status, PLAYER_ACTIVE, PLAYER_GONE)) return fail(RESULT.INVALID);
  player.status = command.status;
  player.lastSeenTick = state.tick;
  return ok([{ kind: "seatStatus", seat: command.actor, status: command.status }]);
});

/** Exposed for tests and for the chaos injector. */
export function knownCommands() {
  return Object.keys(HANDLERS).sort();
}

/** Draws from the state's own rng. Systems call this rather than importing the
 * generator, so that every draw is visibly part of state. */
export function roll(state) {
  return nextU32(state.rng);
}

export { SEAT_MAX };

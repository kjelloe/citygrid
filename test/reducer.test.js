// The reducer skeleton: dispatch, the clock, seats, and the guarantee that an
// unknown command is refused rather than ignored.

import test from "node:test";
import assert from "node:assert/strict";
import { createState, copyState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply, monthOf, yearOf, knownCommands, registerFast, systemNames } from "../engine/reducer.js";
import { CMD_TICK, CMD_JOIN, CMD_LEAVE, CMD_SET_STATUS, isAreaCommand, CMD_PLACE_ROAD, CMD_SET_TAX } from "../engine/commands.js";
import { RESULT } from "../shared/protocol.js";
import { PLAYER_ACTIVE, PLAYER_AFK, PLAYER_GONE, TICKS_PER_MONTH, TICKS_PER_YEAR } from "../engine/constants.js";

const fresh = (over) => createState(defaultOptions({ width: 16, height: 16, seed: 7, ...over }));
const join = (state, seat) => apply(state, { type: CMD_JOIN, actor: seat, seat, name: `P${seat}` });

test("an unknown command is refused, never silently dropped", () => {
  // A dropped command is a desync waiting to happen: one build might handle it
  // and another might not.
  const state = fresh();
  assert.equal(apply(state, { type: "noSuchCommand", actor: 1 }).result, RESULT.INVALID);
  assert.equal(apply(state, {}).result, RESULT.INVALID);
  assert.equal(apply(state, undefined).result, RESULT.INVALID);
  assert.equal(apply(state, { type: 42 }).result, RESULT.INVALID);
});

test("a command from a seat that never joined is refused", () => {
  const state = fresh();
  assert.equal(apply(state, { type: CMD_LEAVE, actor: 1 }).result, RESULT.INVALID);
  assert.equal(apply(state, { type: CMD_LEAVE, actor: 99 }).result, RESULT.INVALID);
  assert.equal(apply(state, { type: CMD_LEAVE, actor: 0 }).result, RESULT.INVALID);
});

test("the tick needs no actor — the clock is not a player", () => {
  const state = fresh();
  assert.equal(apply(state, { type: CMD_TICK }).result, RESULT.OK);
  assert.equal(state.tick, 1);
});

test("a thousand empty ticks are hash-stable across two engines", () => {
  const a = fresh();
  const b = fresh();
  for (let i = 0; i < 1000; i += 1) {
    apply(a, { type: CMD_TICK });
    apply(b, { type: CMD_TICK });
  }
  assert.equal(a.tick, 1000);
  assert.equal(hashState(a), hashState(b));
});

test("empty ticks do not consume randomness", () => {
  // Nothing may draw from the rng unless it is actually deciding something —
  // a stray draw shifts every later decision in the game.
  const state = fresh();
  const before = state.rng.s;
  for (let i = 0; i < 500; i += 1) apply(state, { type: CMD_TICK });
  assert.equal(state.rng.s, before);
});

test("the clock divides into months and years", () => {
  assert.equal(monthOf(0), 0);
  assert.equal(monthOf(TICKS_PER_MONTH), 1);
  assert.equal(monthOf(TICKS_PER_YEAR), 0, "a new year starts at month zero");
  assert.equal(yearOf(TICKS_PER_YEAR - 1), 0);
  assert.equal(yearOf(TICKS_PER_YEAR), 1);
});

test("monthly and yearly systems fire on their boundaries only", () => {
  const fast = [];
  registerFast("probe", (state) => { fast.push(state.tick); return []; });
  const state = fresh();
  for (let i = 0; i < TICKS_PER_MONTH; i += 1) apply(state, { type: CMD_TICK });
  assert.equal(fast.length, TICKS_PER_MONTH, "a fast system runs every tick");
  assert.ok(systemNames().includes("fast:probe"));
});

test("joining takes a seat and starts a treasury", () => {
  const state = fresh({ startingTreasury: 500 });
  assert.equal(join(state, 1).result, RESULT.OK);
  assert.equal(state.players.length, 1);
  assert.equal(state.players[0].seat, 1);
  assert.equal(state.players[0].treasury, 500);
  assert.equal(state.players[0].status, PLAYER_ACTIVE);
});

test("seats are kept in seat order regardless of arrival order", () => {
  // Two engines must walk players identically; arrival order differs by
  // network timing, so it cannot be the iteration order.
  const a = fresh();
  const b = fresh();
  join(a, 3); join(a, 1); join(a, 2);
  join(b, 1); join(b, 2); join(b, 3);
  assert.deepEqual(a.players.map((p) => p.seat), [1, 2, 3]);
  assert.equal(hashState(a), hashState(b), "arrival order leaked into the hash");
});

test("a seat beyond the room's cap is refused", () => {
  const state = fresh({ seats: 2 });
  assert.equal(join(state, 2).result, RESULT.OK);
  assert.equal(join(state, 3).result, RESULT.INVALID);
  assert.equal(join(state, 17).result, RESULT.INVALID);
  assert.equal(join(state, 0).result, RESULT.INVALID);
});

test("leaving does not destroy the seat — the land is still theirs", () => {
  // Ruling 002: nothing a player owns is destroyed by their absence.
  const state = fresh();
  join(state, 1);
  assert.equal(apply(state, { type: CMD_LEAVE, actor: 1 }).result, RESULT.OK);
  assert.equal(state.players.length, 1);
  assert.equal(state.players[0].status, PLAYER_GONE);
});

test("rejoining reclaims the same seat with its money intact", () => {
  const state = fresh();
  join(state, 1);
  state.players[0].treasury = 1234;
  apply(state, { type: CMD_LEAVE, actor: 1 });
  const again = join(state, 1);
  assert.equal(again.result, RESULT.OK);
  assert.equal(again.events[0].kind, "seatReclaimed");
  assert.equal(state.players.length, 1);
  assert.equal(state.players[0].treasury, 1234);
  assert.equal(state.players[0].status, PLAYER_ACTIVE);
});

test("AFK is a status, not a departure", () => {
  const state = fresh();
  join(state, 1);
  assert.equal(apply(state, { type: CMD_SET_STATUS, actor: 1, status: PLAYER_AFK }).result, RESULT.OK);
  assert.equal(state.players[0].status, PLAYER_AFK);
  assert.equal(apply(state, { type: CMD_SET_STATUS, actor: 1, status: 99 }).result, RESULT.INVALID);
});

test("a refused command leaves the state exactly as it was", () => {
  const state = fresh();
  join(state, 1);
  const before = hashState(state);
  apply(state, { type: CMD_JOIN, actor: 1, seat: 99 });
  apply(state, { type: "nonsense", actor: 1 });
  apply(state, { type: CMD_SET_STATUS, actor: 1, status: -5 });
  assert.equal(hashState(state), before, "a rejection mutated state");
});

test("area commands are declared, so the client knows what to coalesce", () => {
  assert.ok(isAreaCommand(CMD_PLACE_ROAD));
  assert.ok(!isAreaCommand(CMD_SET_TAX));
});

test("the command vocabulary is discoverable for the chaos injector", () => {
  const commands = knownCommands();
  assert.ok(commands.includes(CMD_TICK));
  assert.ok(commands.includes(CMD_JOIN));
  assert.deepEqual(commands, [...commands].sort(), "must be stable for reproducible fuzzing");
});

test("copyState gives a snapshot that the reducer cannot reach back into", () => {
  // The reducer mutates by design; snapshots are the caller's job. This is the
  // test that keeps that bargain honest.
  const state = fresh();
  join(state, 1);
  const snapshot = copyState(state);
  const snapshotHash = hashState(snapshot);
  for (let i = 0; i < 50; i += 1) apply(state, { type: CMD_TICK });
  assert.equal(hashState(snapshot), snapshotHash, "the snapshot moved with the state");
  assert.notEqual(hashState(state), snapshotHash);
});
